/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2018

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
#undef TESTMAIN

#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <unistd.h>
#include <stdbool.h>

#include "isom.h"

struct fileparse {
	uint8_t box_header[8];
	size_t box_header_pos;
	size_t box_size;

	bool header_done;

	ssize_t (*data_cb)(void *data, size_t size);
	int (*trigger_cb)(enum fileparse_trigger trig);
};

int isom_parse(struct fileparse *isom, void *buffer, size_t size)
{
	uint8_t *cbuffer = buffer;
	
	while (size) {
		if (isom->box_header_pos < 8) {
			isom->box_header[isom->box_header_pos] = cbuffer[0];
			isom->box_header_pos++;
			if (isom->box_header_pos == 8) {
				isom->box_size = 
					(isom->box_header[0] << 24) |
					(isom->box_header[1] << 16) |
					(isom->box_header[2] << 8) |
					(isom->box_header[3] << 0);
				if (0) printf("box: %zd: %02x%02x%02x%02x %c%c%c%c\n", isom->box_size,
				    isom->box_header[4], 
				    isom->box_header[5], 
				    isom->box_header[6], 
				    isom->box_header[7], 
				    isom->box_header[4], 
				    isom->box_header[5], 
				    isom->box_header[6], 
				    isom->box_header[7]); 
				if (isom->box_size >= 8) {
					isom->box_size -= 8;
				}
				if (isom->box_size == 0) {
					isom->box_header_pos = 0;
				}

				if (isom->box_header[4] == 'm' &&
				    isom->box_header[5] == 'o' &&
				    isom->box_header[6] == 'o' &&
				    isom->box_header[7] == 'f') {
					if (isom->header_done) {
						isom->trigger_cb(FILEPARSE_TRIGGER_PACKET_COMPLETE);
					} else {
						isom->header_done = true;
						isom->trigger_cb(FILEPARSE_TRIGGER_HEADER_COMPLETE);
					}
				}

				isom->data_cb(isom->box_header, 8);
			}
		
		
			cbuffer++;
			size--;
		} else {
			size_t data_size = size;
			
			if (data_size > isom->box_size) {
				data_size = isom->box_size;
			}
			
			isom->box_size -= data_size;
			size -= data_size;
			isom->data_cb(cbuffer, data_size);
			cbuffer += data_size;

			if (isom->box_size == 0) {
				isom->box_header_pos = 0;
			}
		
		}
	}
	
	return 0;
}

struct fileparse *isom_create(
    ssize_t (*data_cb)(void *data, size_t size),
    int (*trigger_cb)(enum fileparse_trigger trig),
    int (**parse)(struct fileparse *mat, void *buffer, size_t size))
{
	struct fileparse *isom;

	isom = calloc(sizeof(struct fileparse), 1);
	if (!isom)
		goto err;

	*parse = isom_parse;
	isom->data_cb = data_cb;
	isom->trigger_cb = trigger_cb;

err:
	return isom;
}

#ifdef TESTMAIN

static ssize_t data_cb(void *data, size_t size)
{
	printf("data: %zd\n", size);
	return size;
}

static int trigger_cb(enum fileparse_trigger trig)
{
	printf("Trigger: %d\n", trig);
	return 0;
}

int main(int argc, char **argv)
{
	char buffer[1000];
	ssize_t r;
	int (*parse)(struct fileparse *mat, void *buffer, size_t size);
	
	struct fileparse *isom = isom_create(data_cb, trigger_cb, &parse);
	
	do {
		r = read(0, buffer, 1000);
		if (r > 0) {
			printf("read: %zd\n", r);
			isom_parse(isom, buffer, r);
		}
	} while (r > 0);

	return 0;
}

#endif
