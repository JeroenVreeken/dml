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
#ifndef _INCLUDE_SOUNDLIB_H_
#define _INCLUDE_SOUNDLIB_H_

#include <stddef.h>
#include <stdint.h>

int soundlib_add_beep(int nr, double freq, double length);
int soundlib_add_silence(int nr, double length);
int soundlib_add_file(int nr, char *name);

uint8_t *soundlib_get(int nr, size_t *size);

int soundlib_init(int init_rate);

#endif /*_INCLUDE_SOUNDLIB_H_ */
