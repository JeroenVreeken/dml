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
	int mode_dec;
	int mode_enc;	
	struct CODEC2 *codec_dec;
	struct CODEC2 *codec_enc;
	
	int samples_per_frame_enc;
	int bits_per_frame_enc;
	int samples_per_frame_dec;
	int bits_per_frame_dec;
	
	int (*encode_cb)(void *arg, uint8_t *encoded, size_t size);
	int (*decode_cb)(void *arg, int16_t *samples, int nr);
	void *encode_cb_arg;
	void *decode_cb_arg;
};

uint8_t trx_codec2_mode_get(struct trx_codec2 *tc)
{
	return tc->mode_enc;
}

int trx_codec2_decode(struct trx_codec2 *tc, uint8_t mode, uint8_t *encoded, size_t size)
{
	if (mode != tc->mode_dec) {
		codec2_destroy(tc->codec_dec);
		tc->codec_dec = codec2_create(mode);
		tc->mode_dec = mode;
	
		tc->samples_per_frame_dec = codec2_samples_per_frame(tc->codec_dec);
		tc->bits_per_frame_dec = codec2_bits_per_frame(tc->codec_dec);
	}
	int bytes_per_frame = (tc->bits_per_frame_dec + 7)/8;

	if (size % bytes_per_frame)
		return -1;
	int16_t samples[tc->samples_per_frame_dec];
	
	int ret = 0;
	
	while (size) {
		codec2_decode(tc->codec_dec, samples, encoded);

		ret |= tc->decode_cb(tc->decode_cb_arg, samples, tc->samples_per_frame_dec);

		size -= bytes_per_frame;
		encoded+= bytes_per_frame;
	}
	
	return ret;
}

int trx_codec2_encode(struct trx_codec2 *tc, int16_t *samples, int nr)
{
	if (nr != tc->samples_per_frame_enc)
		return -1;

	unsigned char bits[(tc->bits_per_frame_enc + 7)/8];
	
	codec2_encode(tc->codec_enc, bits, (short *)samples);
	
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

	tc->mode_enc = CODEC2_MODE_3200;
	tc->codec_enc = codec2_create(tc->mode_enc);
	if (!tc->codec_enc)
		goto err_codec_enc;
	tc->mode_dec = CODEC2_MODE_3200;
	tc->codec_dec = codec2_create(tc->mode_dec);
	if (!tc->codec_dec)
		goto err_codec_dec;

	tc->samples_per_frame_dec = codec2_samples_per_frame(tc->codec_dec);
	tc->bits_per_frame_dec = codec2_bits_per_frame(tc->codec_dec);
	tc->samples_per_frame_enc = codec2_samples_per_frame(tc->codec_enc);
	tc->bits_per_frame_enc = codec2_bits_per_frame(tc->codec_enc);

	printf("codec2: samples_per_frame: %d, bits_per_frame: %d\n",
	    tc->samples_per_frame_enc, tc->bits_per_frame_enc);

	return tc;

err_codec_dec:
	codec2_destroy(tc->codec_enc);
err_codec_enc:
	free(tc);
err_calloc:
	return NULL;
}
