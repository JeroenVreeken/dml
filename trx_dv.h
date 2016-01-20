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
#ifndef _INCLUDE_TRX_DV_H_
#define _INCLUDE_TRX_DV_H_

#include <stdlib.h>
#include <stdint.h>

int trx_dv_init(char *dev, int (*in_cb)(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode), void *arg);
int trx_dv_send(uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size);

#endif /* _INCLUDE_TRX_DV_H_ */