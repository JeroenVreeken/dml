/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2017

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.

 */

#include "soundlib.h"
#include "alaw.h"
#include <stdlib.h>
#include <stdio.h>

#ifdef HAVE_FLITE
#include <flite/flite.h>
#include <samplerate.h>

cst_voice *register_cmu_us_slt(void);

static cst_voice *flite_voice;

static char *spell(char c)
{
	switch (c) {
		case 'a': return "Alfa";
		case 'b': return "Bravo";
		case 'c': return "Charlie";
		case 'd': return "Delta";
		case 'e': return "Echo";
		case 'f': return "Foxtrot";
		case 'g': return "Golf";
		case 'h': return "Hotel";
		case 'i': return "India";
		case 'j': return "Juliett";
		case 'k': return "Kilo";
		case 'l': return "Lima";
		case 'm': return "Mike";
		case 'n': return "November";
		case 'o': return "Oscar";
		case 'p': return "Papa";
		case 'q': return "Quebec";
		case 'r': return "Romeo";
		case 's': return "Sierra";
		case 't': return "Tango";
		case 'u': return "Uniform";
		case 'v': return "Victor";
		case 'w': return "Whiskey";
		case 'x': return "X-ray";
		case 'y': return "Yankee";
		case 'z': return "Zulu";
		case '0': return "Zero";
		case '1': return "One";
		case '2': return "Two";
		case '3': return "Three";
		case '4': return "Four";
		case '5': return "Five";
		case '6': return "Six";
		case '7': return "Seven";
		case '8': return "Eight";
		case '9': return "Nine";
		case '-': return "Dash";
		case '.': return "Point";
		case '/': return "Slash";
	}
	return " ";
}
#endif

static int rate = 8000;

struct libentry {
	int nr;
	uint8_t *data;
	size_t size;
	
	struct libentry *next;
};

static struct libentry *soundlib = NULL;

static struct libentry *soundlib_entry_find(int nr)
{
	struct libentry *entry;
	
	for (entry = soundlib; entry; entry = entry->next)
		if (entry->nr == nr)
			break;
	
	return entry;
}

static void soundlib_entry_clear(struct libentry *entry)
{
	free(entry->data);
	entry->data = NULL;
	entry->size = 0;
}

static struct libentry *soundlib_entry_alloc(int nr)
{
	struct libentry *entry = soundlib_entry_find(nr);
	if (entry) {
		soundlib_entry_clear(entry);
		return entry;
	}
	entry = calloc(sizeof(struct libentry), 1);
	entry->nr = nr;

	entry->next = soundlib;
	soundlib = entry;
	return entry; 
}

static void soundlib_entry_free(struct libentry *entry)
{
	struct libentry **ep;
	
	for (ep = &soundlib; *ep; ep = &(*ep)->next) {
		if (*ep == entry) {
			*ep = entry->next;
			break;
		}
	}
	soundlib_entry_clear(entry);
	free(entry);
}

int soundlib_add_beep(int nr, double freq, double length)
{
	struct libentry *entry = soundlib_entry_alloc(nr);
	
	if (!entry)
		return -1;
	
	entry->data = alaw_beep(freq, rate, length);
	entry->size = length * rate;
	
	return 0;
}

int soundlib_add_silence(int nr, double length)
{
	struct libentry *entry = soundlib_entry_alloc(nr);
	
	if (!entry)
		return -1;

	entry->data = alaw_silence(rate, length);
	entry->size = length * rate;
	
	return 0;
}

int soundlib_add_file(int nr, char *name)
{
	FILE *f = fopen(name, "r");
	
	if (!f)
		return -1;
	
	fseek(f, 0, SEEK_END);
	size_t size = ftell(f);
	fseek(f, 0, SEEK_SET);
	
	struct libentry *entry = soundlib_entry_alloc(nr);
	if (!entry)
		goto err_entry;
	
	printf("soundlib: %d: File '%s' (size %zd)\n", nr, name, size);
	
	entry->size = size;
	entry->data = malloc(size);
	if (!entry->data)
		goto err_data;

	fread(entry->data, entry->size, 1, f);
	fclose(f);

	return 0;
err_data:
	soundlib_entry_free(entry);
err_entry:
	fclose(f);
	return -1;
}

uint8_t *soundlib_get(int nr, size_t *size)
{
	struct libentry *entry = soundlib_entry_find(nr);
	
	if (!entry) {
		if (size)
			*size = 0;
		return NULL;
	}
	
	*size = entry->size;
	return entry->data;
}

#ifdef HAVE_FLITE
static uint8_t *soundlib_add_buffer(uint8_t *old, size_t *size, short *in_samples, size_t in_nr, int in_rate)
{
	SRC_DATA src;
	float data_in[in_nr];
	long out_nr = (in_nr * rate)/in_rate;
	float data_out[out_nr];
	short short_out[out_nr];
	
	src.data_in = data_in;
	src.data_out = data_out;
	src.input_frames = in_nr;
	src.output_frames = out_nr;
	src.src_ratio = rate / (double)in_rate;
	src_short_to_float_array(in_samples, data_in, in_nr);
	
	src_simple(&src, SRC_LINEAR, 1);
	
	src_float_to_short_array(data_out, short_out, out_nr);

	old = realloc(old, *size + out_nr);
	if (!old)
		return NULL;
	
	alaw_encode(old + *size, short_out, out_nr);
	*size += out_nr;
	
	return old;
}

uint8_t *soundlib_synthesize(char *text, size_t *size)
{
	if (size)
		*size = 0;
	uint8_t *sound = NULL;	
	
	cst_wave *wave = flite_text_to_wave(text, flite_voice);
	
	if (wave) {
		size_t addsize = 0;
		
		sound = soundlib_add_buffer(sound, &addsize,  
		    wave->samples, wave->num_samples, wave->sample_rate);
		
		delete_wave(wave);
		if (size)
			*size = addsize;
	}
	return sound;
}


uint8_t *soundlib_spell(char *text, size_t *size)
{
	int i;
	uint8_t *sound = NULL;
	size_t pos = 0;
	
	for (i = 0; i < strlen(text); i++) {
		char *letter = spell(text[i]);
		cst_wave *wave = flite_text_to_wave(letter, flite_voice);
		
		sound = soundlib_add_buffer(sound, &pos,
		    wave->samples, wave->num_samples, wave->sample_rate);
		
		delete_wave(wave);
	}
	if (size)
		*size = pos;
	
	return sound;
}
#else
uint8_t *soundlib_spell(char *text, size_t *size)
{
	if (size)
		*size = 0;
	return NULL;
}
uint8_t *soundlib_synthesize(char *text, size_t *size)
{
	if (size)
		*size = 0;
	return NULL;
}
#endif

int soundlib_init(int init_rate)
{
	rate = init_rate;

#ifdef HAVE_FLITE
	flite_voice = register_cmu_us_slt();
	if (!flite_voice) {
		printf("Could not select voice\n");
		return -1;
	}
#endif
	
	return 0;
}
