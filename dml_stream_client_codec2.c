/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015 - 2017

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
#define _GNU_SOURCE
 
#include <dml/dml_poll.h>
#include <dml/dml.h>
#include <dml/dml_id.h>
#include <dml/dml_crypto.h>
#include "dml_config.h"
#include "dml_stream_client_simple.h"
#include "alaw.h"
#include "ulaw.h"

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <endian.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

#include <codec2/codec2.h>

static int fd_dump = -1;
static int last_hour = -1;
static char *dumpfile = "dml_stream_dump";
static size_t f_datasize = 0;

static unsigned char wav_header[] = {
	// RIFF header
	'R', 'I', 'F', 'F',
	0, 0, 0, 0, // 36 + f_datasize
	'W', 'A', 'V', 'E',
	
	// subchunk
	'f', 'm', 't', ' ',
	16, 0, 0, 0, // subchunk size
	1, 0, // PCM
	1, 0, // 1 channel
	0x40, 0x1f, 0, 0, // 8000Hz -> 0x1f40
	0x80, 0x3e, 0, 0, // 8000 * 2Bytes = 16000
	0x02, 0, // bytes per block (1channel of 16 bit)
	0x10, 0, // bits per sample
	
	// data subchunk
	'd', 'a', 't', 'a',
	0, 0, 0, 0 // f_datasize
};

static int finish_wav(int fd, size_t data)
{
	unsigned char sizeb[4];
	
	sizeb[0] = data & 0xff;
	sizeb[1] = (data >> 8) & 0xff,
	sizeb[2] = (data >> 16) & 0xff,
	sizeb[3] = (data >> 24) & 0xff,
	
	lseek(fd, 40, SEEK_SET);
	write(fd, sizeb, 4);

	data += 36;

	sizeb[0] = data & 0xff;
	sizeb[1] = (data >> 8) & 0xff,
	sizeb[2] = (data >> 16) & 0xff,
	sizeb[3] = (data >> 24) & 0xff,
	
	lseek(fd, 4, SEEK_SET);
	write(fd, sizeb, 4);
	
	return 0;
}


static int data_cb(void *arg, void *data, size_t datasize)
{
	static struct CODEC2 *dec = NULL;
	static int mode = -1;
	time_t now = time(NULL);
	struct tm tm_now;
	
	gmtime_r(&now, &tm_now);
	if (tm_now.tm_hour != last_hour) {
		if (fd_dump >= 0) {
			printf("Closing dump file\n");
			finish_wav(fd_dump, f_datasize);
			close(fd_dump);
		}
		
		char *fname;
		
		asprintf(&fname, "%s.%04d%02d%02d%02d00.wav",
		    dumpfile, 
		    tm_now.tm_year + 1900,
		    tm_now.tm_mon + 1, tm_now.tm_mday,
		    tm_now.tm_hour);
		printf("Open new dump file: %s\n", fname);
		
		fd_dump = open(fname, O_WRONLY | O_CREAT, 
		    S_IRUSR | S_IWUSR | S_IRGRP | S_IROTH);
		free(fname);
		if (fd_dump < 0) {
			printf("Failed to open dump file\n");
			return -1;
		}
		last_hour = tm_now.tm_hour;
		
		write(fd_dump, wav_header, sizeof(wav_header));
	}

	if (datasize <= 8) {
		return 0;
	}
	size_t codecdata = datasize - 8;
	
	size_t nr;
	uint8_t *data8 = data;

	int prev_mode = mode;
	mode = data8[6];
	if (mode != prev_mode) {
		fprintf(stderr, "Switched to mode %d\n", mode);
	}

	switch (mode) {
		case 'A':
		case 'U':
			nr = codecdata;
			break;
		case 's':
		case 'S':
			nr = codecdata/2;
			break;
		default:
			if (prev_mode != mode) {
				if (dec)
					codec2_destroy(dec);
				dec = codec2_create(mode);
			}
			if (dec) {
				int bpf = codec2_bits_per_frame(dec);
				int spf = codec2_samples_per_frame(dec);
				
				nr = codecdata / ((bpf+7)/8) * spf;
			} else {
				nr = 0;
			}
			break;
	}
	
	int16_t samples[nr];

	switch (mode) {
		case 'A':
			alaw_decode(samples, data8 + 8, nr);
			break;
		case 'U':
			ulaw_decode(samples, data8 + 8, nr);
			break;
		case 's': {
			int b;
			union {
				uint8_t d8[2];
				uint16_t s;
			} d2s;
			for (b = 0; b < nr; b++) {
				d2s.d8[0] = data8[8+b*2+0];
				d2s.d8[1] = data8[8+b*2+1];
				samples[b] = le16toh(d2s.s);
			}
		}
		case 'S': {
			int b;
			union {
				uint8_t d8[2];
				uint16_t s;
			} d2s;
			for (b = 0; b < nr; b++) {
				d2s.d8[0] = data8[8+b*2+0];
				d2s.d8[1] = data8[8+b*2+1];
				samples[b] = be16toh(d2s.s);
			}
		}
		default:
			if (dec) {
				int bpf = codec2_bits_per_frame(dec);
				int spf = codec2_samples_per_frame(dec);
				int frames = nr / spf;
				int16_t *speech = samples;
				data8 += 8;
				
				while (frames) {
					codec2_decode(dec, speech, data8);
					speech += spf;
					data8 += (bpf+7)/8;
					frames--;
				}
			}
			break;
	}
	
	size_t i;
	for (i = 0; i < nr; i++) {
		uint16_t samplele = htole16(samples[i]);
		if (write(fd_dump, &samplele, sizeof(uint16_t)) != sizeof(uint16_t))
			return -1;
		f_datasize += sizeof(uint16_t);
	}
	return 0;
}


int main(int argc, char **argv)
{
	char *file = "dml_stream_client.conf";
	char *ca;
	char *server;
	char *req_id_str;
	uint8_t req_id[DML_ID_SIZE];
	struct dml_stream_client_simple *dss;

	if (argc > 2)
		file = argv[2];
	if (argc > 3)
		dumpfile = argv[3];
	if (argc < 2) {
		fprintf(stderr, "No id given\n");
		return -1;
	}
	req_id_str = argv[1];

	if (dml_config_load(file)) {
		fprintf(stderr, "Failed to load config file %s\n", file);
		return -1;
	}
	ca = dml_config_value("ca", NULL, ".");
	server = dml_config_value("server", NULL, "localhost");
	
	if (dml_crypto_init(NULL, ca)) {
		fprintf(stderr, "Failed to init crypto\n");
		return -1;
	}

	dml_str_id(req_id, req_id_str);

	dss = dml_stream_client_simple_create(server, req_id, NULL, data_cb, true);
	if (!dss) {
		printf("Could not create stream\n");
		return -1;
	}

	dml_poll_loop();

	return 0;
}
