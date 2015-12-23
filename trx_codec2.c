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
#include "trx_codec2.h"

#include <codec2/codec2.h>
#include <stdlib.h>
#include <stdio.h>

struct trx_codec2 {
	int mode;	
	struct CODEC2 *codec;
	
	int samples_per_frame;
	int bits_per_frame;
	
	int (*encode_cb)(void *arg, uint8_t *encoded, size_t size);
	int (*decode_cb)(void *arg, int16_t *samples, int nr);
	void *encode_cb_arg;
	void *decode_cb_arg;
};

uint8_t trx_codec2_mode_get(struct trx_codec2 *tc)
{
	return tc->mode;
}

int trx_codec2_decode(struct trx_codec2 *tc, uint8_t *encoded, size_t size)
{
	if (size != (tc->bits_per_frame + 7)/8)
		return -1;
	int16_t samples[tc->samples_per_frame];
	
	codec2_decode(tc->codec, samples, encoded);

	return tc->decode_cb(tc->decode_cb_arg, samples, tc->samples_per_frame);
}

int trx_codec2_encode(struct trx_codec2 *tc, int16_t *samples, int nr)
{
	if (nr != tc->samples_per_frame)
		return -1;

	unsigned char bits[(tc->bits_per_frame + 7)/8];
	
	codec2_encode(tc->codec, bits, (short *)samples);
	
	return tc->encode_cb(tc->encode_cb_arg, bits, sizeof(bits));
}

int trx_codec2_encode_cb_set(struct trx_codec2 *tc, int (*cb)(void *arg, uint8_t *, size_t), void *arg)
{
	tc->encode_cb = cb;
	tc->encode_cb_arg = arg;
	
	return 0;
}

int trx_codec2_decode_cb_set(struct trx_codec2 *tc, int (*cb)(void *arg, int16_t *, int), void *arg)
{
	tc->decode_cb = cb;
	tc->decode_cb_arg = arg;
	
	return 0;
}
struct trx_codec2 *trx_codec2_init(void)
{
	struct trx_codec2 *tc;
	
	tc = calloc(1, sizeof(struct trx_codec2));
	if (!tc)
		goto err_calloc;

	tc->mode = CODEC2_MODE_3200;
	tc->codec = codec2_create(tc->mode);
	if (!tc->codec)
		goto err_codec;

	tc->samples_per_frame = codec2_samples_per_frame(tc->codec);
	tc->bits_per_frame = codec2_bits_per_frame(tc->codec);

	printf("codec2: samples_per_frame: %d, bits_per_frame: %d\n",
	    tc->samples_per_frame, tc->bits_per_frame);

	return tc;

err_codec:
	free(tc);
err_calloc:
	return NULL;
}
