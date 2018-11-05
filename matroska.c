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
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include <stdio.h>
#include <stdbool.h>

#include "matroska.h"

enum matroska_state {
	MATROSKA_ELEMENTID_FIRSTOCTET,
	MATROSKA_ELEMENTID_OCTETS,
	MATROSKA_SIZE_FIRSTOCTET,
	MATROSKA_SIZE_OCTETS,
	MATROSKA_ELEMENT_OCTETS,
};

#define MATROSKA_LEVEL_MAX 5

struct matroska_element {
	enum matroska_state state;
	
	uint8_t id[4];
	int id_pos;
	int id_size;

	uint64_t size;
	int size_pos;
	int size_size;

	uint64_t pos;
};

struct fileparse {
	int level;
	struct matroska_element level_state[MATROSKA_LEVEL_MAX+1];
	
	ssize_t (*data_cb)(void *data, size_t size);
	int (*trigger_cb)(enum fileparse_trigger trig);
};

bool matroska_element_dive(struct fileparse *mat)
{
	struct matroska_element *em = &mat->level_state[mat->level];

	if (em->id[0] == 0x18 &&
	    em->id[1] == 0x53 &&
	    em->id[2] == 0x80 &&
	    em->id[3] == 0x67)
		return true;
	return false;
}

int matroska_element_trigger(struct fileparse *mat)
{
	struct matroska_element *em = &mat->level_state[mat->level];

	if (em->id[0] == 0x16 &&
	    em->id[1] == 0x54 &&
	    em->id[2] == 0xae &&
	    em->id[3] == 0x6b)
		mat->trigger_cb(FILEPARSE_TRIGGER_HEADER_COMPLETE);

	if (em->id[0] == 0x1f &&
	    em->id[1] == 0x43 &&
	    em->id[2] == 0xb6 &&
	    em->id[3] == 0x75)
		mat->trigger_cb(FILEPARSE_TRIGGER_PACKET_COMPLETE);

	return 0;
}

#define PUSH(d) do { mat->data_cb(bufo + pos, (d)); pos += (d); } while(0)

int matroska_parse(struct fileparse *mat, void *buffer, size_t size)
{
	uint8_t *bufo = buffer;
	size_t pos = 0;
	
	while (pos < size) {
		struct matroska_element *em = &mat->level_state[mat->level];

		switch(em->state) {
			case MATROSKA_ELEMENTID_FIRSTOCTET: {
				em->pos = 0;
				memset(em->id, 0, 4);
				em->id[0] = bufo[pos];
				em->id_pos = 1;

				if (bufo[pos] & 0x80) {
					em->id_size = 1;
					em->state = MATROSKA_SIZE_FIRSTOCTET;
				} else if (bufo[pos] & 0x40) {
					em->id_size = 2;
					em->state = MATROSKA_ELEMENTID_OCTETS;
				} else if (bufo[pos] & 0x20) {
					em->id_size = 3;
					em->state = MATROSKA_ELEMENTID_OCTETS;
				} else if (bufo[pos] & 0x10) {
					em->id_size = 4;
					em->state = MATROSKA_ELEMENTID_OCTETS;
				}
				PUSH(1);
				break;
			}
			case MATROSKA_ELEMENTID_OCTETS: {
				em->id[em->id_pos] = bufo[pos];				
				em->id_pos++;
				if (em->id_pos == em->id_size) {
					em->state = MATROSKA_SIZE_FIRSTOCTET;
				}
				PUSH(1);
				break;
			}
			case MATROSKA_SIZE_FIRSTOCTET: {
				memset(&em->size, 0, 8);

				if (bufo[pos] & 0x80) {
					em->size_size = 1;
					em->size_pos = 1;
					em->size = bufo[pos] & 0x7f;
					em->state = MATROSKA_ELEMENT_OCTETS;
				} else if (bufo[pos] & 0x40) {
					em->size_size = 2;
					em->size_pos = 1;
					em->size = bufo[pos] & 0x3f;
					em->state = MATROSKA_SIZE_OCTETS;
				} else if (bufo[pos] & 0x20) {
					em->size_size = 3;
					em->size_pos = 1;
					em->size = bufo[pos] & 0x1f;
					em->state = MATROSKA_SIZE_OCTETS;
				} else if (bufo[pos] & 0x10) {
					em->size_size = 4;
					em->size_pos = 1;
					em->size = bufo[pos] & 0x0f;
					em->state = MATROSKA_SIZE_OCTETS;
				} else if (bufo[pos] & 0x08) {
					em->size_size = 5;
					em->size_pos = 1;
					em->size = bufo[pos] & 0x07;
					em->state = MATROSKA_SIZE_OCTETS;
				} else if (bufo[pos] & 0x04) {
					em->size_size = 6;
					em->size_pos = 1;
					em->size = bufo[pos] & 0x03;
					em->state = MATROSKA_SIZE_OCTETS;
				} else if (bufo[pos] & 0x02) {
					em->size_size = 7;
					em->size_pos = 1;
					em->size = bufo[pos] & 0x01;
					em->state = MATROSKA_SIZE_OCTETS;
				} else if (bufo[pos] & 0x01) {
					em->size_size = 8;
					em->size_pos = 1;
					em->size = 0;
					em->state = MATROSKA_SIZE_OCTETS;
				}
				if (em->state == MATROSKA_ELEMENT_OCTETS)
					printf("%02x %02x %02x %02x: %ld 0x%016lx\n",
					    em->id[0], em->id[1], em->id[2], em->id[3],
					    (long)em->size, (long)em->size);
				PUSH(1);
				break;
			}
			case MATROSKA_SIZE_OCTETS: {
				em->size <<= 8;
				em->size |= bufo[pos];				
				em->size_pos++;
				if (em->size_pos == em->size_size) {
					em->state = MATROSKA_ELEMENT_OCTETS;
				}
				if (em->state == MATROSKA_ELEMENT_OCTETS)
					printf("%02x %02x %02x %02x: %ld 0x%016lx\n",
					    em->id[0], em->id[1], em->id[2], em->id[3],
					    (long)em->size, (long)em->size);
				PUSH(1);
				break;
			}
			case MATROSKA_ELEMENT_OCTETS: {
				if (em->pos == em->size) {
					matroska_element_trigger(mat);
					
					em->state = MATROSKA_ELEMENTID_FIRSTOCTET;
					if (mat->level) {
						mat->level--;
					}
				} else if (matroska_element_dive(mat)) {
					if (mat->level < MATROSKA_LEVEL_MAX)
						mat->level++;
				} else {
					size_t needed = em->size - em->pos;
					size_t avail = size - pos;
					size_t inc;
					if (needed < avail)
						inc = needed;
					else
						inc = avail;
					em->pos += inc;
					PUSH(inc);
				}
				break;
			}
		}
	}
	
	return 0;
}

struct fileparse *matroska_create(
    ssize_t (*data_cb)(void *data, size_t size),
    int (*trigger_cb)(enum fileparse_trigger trig),
    int (**parse)(struct fileparse *mat, void *buffer, size_t size)
)
{
	struct fileparse *mat;
	
	mat = calloc(1, sizeof(struct fileparse));
	if (!mat)
		goto err_calloc;
	
	mat->data_cb = data_cb;
	mat->trigger_cb = trigger_cb;
	*parse = matroska_parse;
	
	return mat;

err_calloc:
	return NULL;
}


