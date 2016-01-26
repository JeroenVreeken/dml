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
#ifndef _INCLUDE_OGG_H_
#define _INCLUDE_OGG_H_

#include <stdint.h>
#include <stdbool.h>
#include <unistd.h>

struct ogg;

enum ogg_trigger {
	OGG_TRIGGER_HEADER_COMPLETE,
	OGG_TRIGGER_PACKET_COMPLETE,
};

int ogg_parse(struct ogg *mat, void *buffer, size_t size);

struct ogg *ogg_create(
    ssize_t (*data_cb)(void *data, size_t size),
    int (*trigger_cb)(enum ogg_trigger trig)
);

#endif /* _INCLUDE_OGG_H_ */
