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

int soundlib_init(int init_rate)
{
	rate = init_rate;
	
	return 0;
}
