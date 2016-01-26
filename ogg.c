/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2016

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

#include "ogg.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static struct ogg {
    ssize_t (*data_cb)(void *data, size_t size);
    int (*trigger_cb)(enum ogg_trigger trig);
} ogg;


uint8_t ogg_page[65536];
size_t ogg_pos = 0;
uint8_t ogg_segments;
size_t ogg_total_segments;

enum ogg_state {
	OGG_STATE_HEADER,
	OGG_STATE_SEGMENT_TABLE,
	OGG_STATE_DATA,
} ogg_state = OGG_STATE_HEADER;

uint32_t vorbis_header;
uint32_t theora_header;


int ogg_in(ssize_t r)
{
	bool repeat;
	
	ogg_pos += r;
	
	do {
		repeat = false;
		switch (ogg_state) {
			case OGG_STATE_HEADER: {
				if (ogg_pos >= 27) {
					ogg_segments = ogg_page[26];
					
					repeat = true;
					ogg_state = OGG_STATE_SEGMENT_TABLE;
				}
				break;
			}
			case OGG_STATE_SEGMENT_TABLE: {
				if (ogg_pos >= 27 + ogg_segments) {
					int i;
					
					ogg_total_segments = 27 + ogg_segments;
					for (i = 0; i < ogg_segments; i++) {
						ogg_total_segments += ogg_page[27 + i];
					}
					
//					printf("%zd segment end ", ogg_total_segments);
					repeat = true;
					ogg_state = OGG_STATE_DATA;
				}
				break;
			}
			case OGG_STATE_DATA: {
				if (ogg_pos >= ogg_total_segments) {
					uint32_t serial;
					
					if (ogg_page[0] == 'O' &&
					    ogg_page[1] == 'g' &&
					    ogg_page[2] == 'g' &&
					    ogg_page[3] == 'S') {
//						printf("Found OggS pattern ");
					}
					serial = ogg_page[14];
					serial |= ogg_page[15] << 8;
					serial |= ogg_page[16] << 16;
					serial |= ogg_page[17] << 24;
					
					if (ogg_page[5] & 0x02 &&
					    ogg_page[27 + ogg_segments + 1] == 'v' &&
					    ogg_page[27 + ogg_segments + 2] == 'o' &&
					    ogg_page[27 + ogg_segments + 3] == 'r' &&
					    ogg_page[27 + ogg_segments + 4] == 'b' &&
					    ogg_page[27 + ogg_segments + 5] == 'i' &&
					    ogg_page[27 + ogg_segments + 6] == 's') {
						printf("Start of Vorbis stream ");
						vorbis_header = serial;
					}
					if (ogg_page[5]& 0x02 &&
					    ogg_page[27 + ogg_segments + 1] == 't' &&
					    ogg_page[27 + ogg_segments + 2] == 'h' &&
					    ogg_page[27 + ogg_segments + 3] == 'e' &&
					    ogg_page[27 + ogg_segments + 4] == 'o' &&
					    ogg_page[27 + ogg_segments + 5] == 'r' &&
					    ogg_page[27 + ogg_segments + 6] == 'a') {
						printf("Start of Theora stream ");
						theora_header = serial;
					}
					    
//					printf("bitflags: %02x segments: %d serial: %08x ", ogg_page[5], ogg_segments, serial);
//					printf(" %02x\n", ogg_page[27 + ogg_segments]);
				
					if (vorbis_header == serial) {
						if (!(ogg_page[27 + ogg_segments] & 1)) {
							printf("First vorbis data\n");
							vorbis_header = 0;
							if (!theora_header)
								ogg.trigger_cb(OGG_TRIGGER_HEADER_COMPLETE);
						} else {
							printf("Vorbis header\n");
							ogg.data_cb(ogg_page, ogg_pos);
						}
					}
					
					if (theora_header == serial) {
						if (!(ogg_page[27 + ogg_segments] & 0x80)) {
							printf("First theora data\n");
							theora_header = 0;
							if (!vorbis_header)
								ogg.trigger_cb(OGG_TRIGGER_HEADER_COMPLETE);
						} else {
							printf("Theora header\n");
							ogg.data_cb(ogg_page, ogg_pos);
						}
					}
					
					int i;
					for (i = 0; i < ogg_pos; i += 1024) {
						int size = ogg_pos - i;
						if (size > 1024)
							size = 1024;
						ogg.data_cb(ogg_page + i, size);
						ogg.trigger_cb(OGG_TRIGGER_PACKET_COMPLETE);
					}
					
					memmove(ogg_page, ogg_page + ogg_total_segments, ogg_pos - ogg_total_segments);
					ogg_pos -= ogg_total_segments;
					repeat = true;
					ogg_state = OGG_STATE_HEADER;
				}
				break;
			}
		}
	} while (repeat);

	return 0;
}

int ogg_parse(struct ogg *ogg, void *buffer, size_t size)
{
	char *bufb = buffer;
	
	while (size) {
		size_t copy = size;
		if (sizeof(ogg_page) - ogg_pos < size)
			size = sizeof(ogg_page) - ogg_pos;
		memcpy(ogg_page + ogg_pos, bufb, copy);
		ogg_in(copy);
		bufb += copy;
		size -= copy;
	}
	
	return 0;
}
struct ogg *ogg_create(
    ssize_t (*data_cb)(void *data, size_t size),
    int (*trigger_cb)(enum ogg_trigger trig)
)
{
	ogg.data_cb = data_cb;
	ogg.trigger_cb = trigger_cb;
	
	return &ogg;
}

#include "ogg.h"
