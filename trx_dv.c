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
#include "trx_dv.h"
#include <eth_ar/eth_ar.h>
#include "dml_poll.h"
#include "alaw.h"

#include <arpa/inet.h>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <net/if.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <unistd.h>

#include <codec2/codec2.h>

static int dv_sock = -1;

static int limit_mode = -1;

static int (*in_cb)(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode) = NULL;
static int (*ctrl_cb)(void *arg, uint8_t from[6], uint8_t to[6], char *ctrl, size_t size) = NULL;
static void *in_cb_arg = NULL;

static int trx_dv_in_cb(void *arg)
{
	uint8_t dv_frame[6 + 6 + 2 + 1500];
	ssize_t ret;
	
	ret = recv(dv_sock, dv_frame, sizeof(dv_frame), 0);
	if (ret >= 14) {
		uint16_t type = (dv_frame[12] << 8) | dv_frame[13];
		int mode;
		size_t datasize;
		switch (type) {
			case ETH_P_CODEC2_3200:
				mode = CODEC2_MODE_3200;
				datasize = 8;
				break;
			case ETH_P_CODEC2_2400:
				mode = CODEC2_MODE_2400;
				datasize = 6;
				break;
			case ETH_P_CODEC2_1600:
				mode = CODEC2_MODE_1600;
				datasize = 8;
				break;
			case ETH_P_CODEC2_1400:
				mode = CODEC2_MODE_1400;
				datasize = 7;
				break;
			case ETH_P_CODEC2_1300:
				mode = CODEC2_MODE_1300;
				datasize = 7;
				break;
			case ETH_P_CODEC2_1200:
				mode = CODEC2_MODE_1200;
				datasize = 6;
				break;
			case ETH_P_CODEC2_700:
				mode = CODEC2_MODE_700;
				datasize = 4;
				break;
			case ETH_P_CODEC2_700B:
				mode = CODEC2_MODE_700B;
				datasize = 4;
				break;
			case ETH_P_ALAW:
				mode = 'A';
				datasize = ret - 14;
				break;
			case ETH_P_AR_CONTROL:
				ctrl_cb(in_cb_arg, dv_frame + 6, dv_frame, (char *)dv_frame + 14, ret - 14);
				/* fall through */;
			default:
				return 0;
		}
		if (ret >= datasize + 14) {
			in_cb(in_cb_arg, dv_frame + 6, dv_frame, dv_frame + 14, datasize, mode);
		}
	} else {
		printf("frame not the right size\n");
		int i;
		for (i = 0; i < ret; i++) {
			printf("%02x ", dv_frame[i]);
		}
		printf("\n");
	}
	return 0;
}

static struct CODEC2 *trans_enc;
static struct CODEC2 *trans_dec;
static short *trans_speech;
static int trans_samples;
static int trans_samples_frame;
static int trans_mode;
static int trans_frame_size;

int trx_dv_transcode(uint8_t from[6], uint8_t to[6], int from_mode, uint8_t *from_dv, size_t from_size)
{
	int samples;
	
	if (from_mode != 'A') {
		if (from_mode != trans_mode) {
			if (trans_dec)
				codec2_destroy(trans_dec);
			trans_mode = from_mode;
			trans_dec = codec2_create(trans_mode);
		}
		samples = codec2_samples_per_frame(trans_dec);
	} else {
		samples = from_size;
	}
	
	short speech[samples];
	
	if (from_mode != 'A') {
		codec2_decode(trans_dec, speech, from_dv);
	} else {
		alaw_decode(speech, from_dv, samples);
	}
	
	while (samples) {
		int copy = samples;
		if (copy > trans_samples_frame - trans_samples)
			copy = trans_samples_frame - trans_samples;
		memcpy(trans_speech + trans_samples, speech, copy * 2);
		samples -= copy;
		trans_samples += copy;
		
		if (trans_samples == trans_samples_frame) {
			uint8_t frame[trans_frame_size];
			
			codec2_encode(trans_enc, frame, trans_speech);
			
			trx_dv_send(from, to, limit_mode, frame, trans_frame_size);
			
			trans_samples = 0;
		}
	}

	return 0;
}

int trx_dv_send(uint8_t from[6], uint8_t to[6], int mode, uint8_t *dv, size_t size)
{
	uint8_t dv_frame[6 + 6 + 2 + size];
	uint16_t type;
	
	if (limit_mode >= 0 && mode != limit_mode) {
		return trx_dv_transcode(from, to, mode, dv, size);
	}
	
	switch (mode) {
		case CODEC2_MODE_3200:
			type = htons(ETH_P_CODEC2_3200);
			break;
		case CODEC2_MODE_2400:
			type = htons(ETH_P_CODEC2_2400);
			break;
		case CODEC2_MODE_1600:
			type = htons(ETH_P_CODEC2_1600);
			break;
		case CODEC2_MODE_1400:
			type = htons(ETH_P_CODEC2_1400);
			break;
		case CODEC2_MODE_1300:
			type = htons(ETH_P_CODEC2_1300);
			break;
		case CODEC2_MODE_1200:
			type = htons(ETH_P_CODEC2_1200);
			break;
		case CODEC2_MODE_700:
			type = htons(ETH_P_CODEC2_700);
			break;
		case CODEC2_MODE_700B:
			type = htons(ETH_P_CODEC2_700B);
			break;
		case 'A':
			type = htons(ETH_P_ALAW);
			break;
		default:
			return -1;
	}
	
	memcpy(dv_frame + 0, to, 6);
	memcpy(dv_frame + 6, from, 6);
	memcpy(dv_frame + 12, &type, 2);
	memcpy(dv_frame + 14, dv, size);
	
	ssize_t ret = send(dv_sock, dv_frame, 14 + size, 0);
	if (ret == 14 + size)
		return 0;
	
	return -1;
}

int trx_dv_send_control(uint8_t from[6], uint8_t to[6], char *control)
{
	size_t control_size = strlen(control);
	uint16_t type = htons(ETH_P_AR_CONTROL);

	uint8_t dv_frame[6 + 6 + 2 + control_size];
	memcpy(dv_frame + 0, to, 6);
	memcpy(dv_frame + 6, from, 6);
	memcpy(dv_frame + 12, &type, 2);
	memcpy(dv_frame + 14, control, control_size);

	ssize_t ret = send(dv_sock, dv_frame, 14 + control_size, 0);
	if (ret == 14 + control_size)
		return 0;
	
	return -1;
}

int trx_dv_duration(size_t size, int mode)
{
	switch (mode) {
		case CODEC2_MODE_3200:
			return (size * 20) / 8;
		case CODEC2_MODE_2400:
			return (size * 20) / 6;
		case CODEC2_MODE_1600:
			return (size * 40) / 8;
		case CODEC2_MODE_1400:
			return (size * 40) / 7;
		case CODEC2_MODE_1300:
			return (size * 40) / 7;
		case CODEC2_MODE_1200:
			return (size * 40) / 6;
		case CODEC2_MODE_700:
			return (size * 40) / 4;
		case CODEC2_MODE_700B:
			return (size * 40) / 4;
		case 'A':
			return size / 8;
		default:
			return -1;
	}
}

int trx_dv_init(char *dev, 
    int (*new_in_cb)(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode),
    int (*new_ctrl_cb)(void *arg, uint8_t from[6], uint8_t to[6], char *ctrl, size_t size),
    void *arg,
    char *mode)
{
	int sock;
	short protocol = htons(ETH_P_ALL);
	
	in_cb = new_in_cb;
	in_cb_arg = arg;
	ctrl_cb = new_ctrl_cb;
	
	if (mode) {
		if (!strcmp(mode, "3200")) {
			limit_mode = CODEC2_MODE_3200;
		} else if (!strcmp(mode, "2400")) {
			limit_mode = CODEC2_MODE_2400;
		} else if (!strcmp(mode, "1600")) {
			limit_mode = CODEC2_MODE_1600;
		} else if (!strcmp(mode, "1400")) {
			limit_mode = CODEC2_MODE_1400;
		} else if (!strcmp(mode, "1300")) {
			limit_mode = CODEC2_MODE_1300;
		} else if (!strcmp(mode, "1200")) {
			limit_mode = CODEC2_MODE_1200;
		} else if (!strcmp(mode, "700")) {
			limit_mode = CODEC2_MODE_700;
		} else if (!strcmp(mode, "700B")) {
			limit_mode = CODEC2_MODE_700B;
		} else {
			return -1;
		}
		
		trans_enc = codec2_create(limit_mode);
		trans_samples_frame = codec2_samples_per_frame(trans_enc);
		trans_speech = calloc(trans_samples_frame, sizeof(short));
		trans_samples = 0;
		trans_mode = -1;
		trans_frame_size = codec2_bits_per_frame(trans_enc);
		trans_frame_size += 7;
		trans_frame_size /= 8;
	}

	sock = socket(AF_PACKET, SOCK_RAW, protocol);
	if (sock < 0)
		goto err_socket;

	struct ifreq ifr;

	size_t if_name_len = strlen(dev);
	if (if_name_len >= sizeof(ifr.ifr_name))
		goto err_len;
	strcpy(ifr.ifr_name, dev);

	if (ioctl(sock, SIOCGIFINDEX, &ifr) < 0)
		goto err_ioctl;
	
	int ifindex = ifr.ifr_ifindex;

	struct sockaddr_ll sll = { 0 };
	
	sll.sll_family = AF_PACKET; 
	sll.sll_ifindex = ifindex;
	sll.sll_protocol = protocol;
	if(bind(sock, (struct sockaddr *)&sll , sizeof(sll)) < 0)
		goto err_bind;

	if (dml_poll_add(trx_dv_init, trx_dv_in_cb, NULL, NULL))
		goto err_poll;
	dml_poll_fd_set(trx_dv_init, sock);
	dml_poll_in_set(trx_dv_init, true);

	dv_sock = sock;

	return 0;

err_poll:
err_bind:
err_ioctl:
err_len:
	close(sock);
err_socket:
	return -1;
}
