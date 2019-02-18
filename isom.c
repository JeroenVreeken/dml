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
#define TESTMAIN

#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <unistd.h>
#include <stdbool.h>

#include "isom.h"

struct fileparse {
	uint8_t *box;
	size_t cur_size;
	size_t box_size;

	ssize_t (*data_cb)(void *data, size_t size);
	int (*trigger_cb)(enum fileparse_trigger trig);
};

char *subbox[] = {
	"moov",
		"trak",
			"mdia",
				"minf",
					"stbl",
	"moof",
		"traf",
};

char *removebox[] = {
	"tfdt",
};

char *dumpbox[] = {
	"mvhd",
	"mfhd",
	"stts",
	"tfdt",
//	"trun",
};

void printbox(void *box, size_t *box_size, int level)
{
	uint8_t *cbox = box;
	uint8_t *type = &cbox[4];
	char levelstr[level*2+1];
	
	memset(levelstr, ' ', level*2);
	levelstr[level*2] = 0;
	printf("%sbox: %c%c%c%c %zd\n", levelstr,
	     type[0], type[1], type[2], type[3], *box_size);

	int i;
	bool has_subbox = false;
	for (i = 0; i < sizeof(subbox)/sizeof(subbox[0]); i++) {
		if (!memcmp(subbox[i], type, 4)) {
			has_subbox = true;
		}
	}
	bool is_removebox = false;
	for (i = 0; i < sizeof(removebox)/sizeof(removebox[0]); i++) {
		if (!memcmp(removebox[i], type, 4)) {
			is_removebox = true;
		}
	}
	bool is_dumpbox = false;
	for (i = 0; i < sizeof(dumpbox)/sizeof(dumpbox[0]); i++) {
		if (!memcmp(dumpbox[i], type, 4)) {
			is_dumpbox = true;
		}
	}
	

	if (is_dumpbox) {
		printf("%s  ", levelstr);
		for (i = 0; i < *box_size; i++) {
			if (i == 8)
				printf(" ");
			printf("%02x", cbox[i]);
		}
		printf("\n");
	}

	if (is_removebox) {
		*box_size = 0;
		return;
	}

	size_t pos;
	if (has_subbox) for (pos = 8; pos < *box_size; ) {

		size_t subbox_size = 
			(cbox[pos + 0] << 24) |
			(cbox[pos + 1] << 16) |
			(cbox[pos + 2] << 8) |
			(cbox[pos + 3] << 0);
		
		size_t org_size = subbox_size;
		printbox(&cbox[pos], &subbox_size, level+1);
		
		if (subbox_size < org_size) {
			size_t removed = org_size - subbox_size;
			
			memmove(&cbox[pos+subbox_size], &cbox[pos+removed], *box_size - (pos + removed));
			printf("%sremoved %zd, %zd <- %zd (%zd) %zd\n", levelstr, removed, pos, pos+removed, *box_size - (pos+removed), subbox_size);
			*box_size -= removed;
		}

		pos += subbox_size;
	}
	printf("%s%zd\n", levelstr, *box_size);
	cbox[0] = (*box_size >> 24) & 0xff;
	cbox[1] = (*box_size >> 16) & 0xff;
	cbox[2] = (*box_size >> 8) & 0xff;
	cbox[3] = (*box_size >> 0) & 0xff;
}

int isom_parse(struct fileparse *isom, void *buffer, size_t size)
{
	char *cbuffer = buffer;
	
	while (size) {
		if (isom->cur_size < 4) {
			size_t copy = 4 - isom->cur_size;
			if (size < copy) {
				copy = size;
			}
			memcpy(&isom->box[isom->cur_size], cbuffer, copy);
			cbuffer += copy;
			size -= copy;
			isom->cur_size += copy;
			if (isom->cur_size == 4) {
				isom->box_size = 
				    (isom->box[0] << 24) |
				    (isom->box[1] << 16) |
				    (isom->box[2] << 8) |
				    (isom->box[3] << 0);
				
				isom->box = realloc(isom->box, isom->box_size);
			}
		} else {
			size_t copy = isom->box_size - isom->cur_size;
			if (size < copy) {
				copy = size;
			}
			memcpy(&isom->box[isom->cur_size], cbuffer, copy);
			cbuffer += copy;
			size -= copy;
			isom->cur_size += copy;
		}
		if (isom->cur_size == isom->box_size) {
			printbox(isom->box, &isom->box_size, 0);
					
			write(2, isom->box, isom->box_size);
		
			isom->cur_size = 0;
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
	isom->box = malloc(4);

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
			isom_parse(isom, buffer, r);
		}
	} while (r > 0);

	return 0;
}

#endif
