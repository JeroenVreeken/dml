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

#include "fileparse.h"

struct fileparse *ogg_create(
    ssize_t (*data_cb)(void *data, size_t size),
    int (*trigger_cb)(enum fileparse_trigger trig),
    int (**parse)(struct fileparse *ogg, void *buffer, size_t size)
);

#endif /* _INCLUDE_OGG_H_ */
