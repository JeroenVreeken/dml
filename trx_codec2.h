/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015

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
#ifndef _INCLUDE_TRX_CODEC2_H_
#define _INCLUDE_TRX_CODEC2_H_

#include <stdint.h>
#include <stdlib.h>

struct trx_codec2 *trx_codec2_init(void);

int trx_codec2_encode(struct trx_codec2 *tc, int16_t *samples, int nr);
int trx_codec2_decode(struct trx_codec2 *tc, uint8_t mode, uint8_t *encoded, size_t size);
int trx_codec2_encode_cb_set(struct trx_codec2 *tc, int (*cb)(void *arg, uint8_t *, size_t), void *arg);
int trx_codec2_decode_cb_set(struct trx_codec2 *tc, int (*cb)(void *arg, int16_t *, int), void *arg);
uint8_t trx_codec2_mode_get(struct trx_codec2 *tc);

#endif /* _INCLUDE_TRX_CODEC2_H_ */
