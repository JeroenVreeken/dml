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
#include <dml/dml_poll.h>
#include "alaw.h"
#include "ulaw.h"

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
static char *dv_dev = NULL;
static uint8_t dv_mac[6] = { 0 };
static void (*dv_mac_cb)(uint8_t *mac) = NULL;

#define TRX_DV_WATCHDOG 5

static int (*in_cb)(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode) = NULL;
static int (*ctrl_cb)(void *arg, uint8_t from[6], uint8_t to[6], char *ctrl, size_t size) = NULL;
static int (*fprs_cb)(void *arg, uint8_t from[6], uint8_t *fprs, size_t size) = NULL;
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
			case ETH_P_CODEC2_700C:
				mode = CODEC2_MODE_700C;
				datasize = 4;
				break;
#ifdef CODEC2_MODE_1300C
			case ETH_P_CODEC2_1300C:
				mode = CODEC2_MODE_1300C;
				datasize = 7;
				break;
#endif
			case ETH_P_ALAW:
				mode = 'A';
				datasize = ret - 14;
				break;
			case ETH_P_ULAW:
				mode = 'U';
				datasize = ret - 14;
				break;
			case ETH_P_LE16:
				mode = 's';
				datasize = ret - 14;
				break;
			case ETH_P_BE16:
				mode = 'S';
				datasize = ret - 14;
				break;
			case ETH_P_AR_CONTROL:
				return ctrl_cb(in_cb_arg, dv_frame + 6, dv_frame, (char *)dv_frame + 14, ret - 14);
			case ETH_P_FPRS:
				return fprs_cb(in_cb_arg, dv_frame + 6, dv_frame + 14, ret - 14);
			default:
				return 0;
		}
		if (ret >= datasize + 14) {
			in_cb(in_cb_arg, dv_frame + 6, dv_frame, dv_frame + 14, datasize, mode);
		}
	} else {
		printf("frame not the right size: %zd: \n", ret);
		int i;
		for (i = 0; i < ret; i++) {
			printf("%02x ", dv_frame[i]);
		}
		printf("\n");
	}
	return 0;
}


int trx_dv_send(uint8_t from[6], uint8_t to[6], int mode, uint8_t *dv, size_t size)
{
	uint16_t type;
	ssize_t max_size = 0;
	
	switch (mode) {
		case CODEC2_MODE_3200:
			type = htons(ETH_P_CODEC2_3200);
			max_size = 8;
			break;
		case CODEC2_MODE_2400:
			type = htons(ETH_P_CODEC2_2400);
			max_size = 6;
			break;
		case CODEC2_MODE_1600:
			type = htons(ETH_P_CODEC2_1600);
			max_size = 8;
			break;
		case CODEC2_MODE_1400:
			type = htons(ETH_P_CODEC2_1400);
			max_size = 7;
			break;
		case CODEC2_MODE_1300:
			type = htons(ETH_P_CODEC2_1300);
			max_size = 7;
			break;
		case CODEC2_MODE_1200:
			type = htons(ETH_P_CODEC2_1200);
			max_size = 6;
			break;
		case CODEC2_MODE_700:
			type = htons(ETH_P_CODEC2_700);
			max_size = 4;
			break;
		case CODEC2_MODE_700B:
			type = htons(ETH_P_CODEC2_700B);
			max_size = 4;
			break;
		case CODEC2_MODE_700C:
			type = htons(ETH_P_CODEC2_700C);
			max_size = 4;
			break;
#ifdef CODEC2_MODE_1300C
		case CODEC2_MODE_1300C:
			type = htons(ETH_P_CODEC2_1300C);
			max_size = 7;
			break;
#endif
		case 'A':
			type = htons(ETH_P_ALAW);
			max_size = 320;
			break;
		case 'U':
			type = htons(ETH_P_ULAW);
			max_size = 320;
			break;
		case 's':
			type = htons(ETH_P_LE16);
			max_size = 640;
			break;
		case 'S':
			type = htons(ETH_P_BE16);
			max_size = 640;
			break;
		default:
			return -1;
	}
	
	while (size) {
		uint8_t dv_frame[6 + 6 + 2 + max_size];
		size_t out_size = size;
		if (out_size > max_size)
			out_size = max_size;
		memcpy(dv_frame + 0, to, 6);
		memcpy(dv_frame + 6, from, 6);
		memcpy(dv_frame + 12, &type, 2);
		memcpy(dv_frame + 14, dv, out_size);
	
		ssize_t ret = send(dv_sock, dv_frame, 14 + out_size, 0);
		if (ret == 14 + out_size) {
			size -= out_size;
			dv += out_size;
		}
	}
	if (size == 0)
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

int trx_dv_send_fprs(uint8_t from[6], uint8_t to[6], uint8_t *data, size_t size)
{
	uint16_t type = htons(ETH_P_FPRS);

	uint8_t dv_frame[6 + 6 + 2 + size];
	memcpy(dv_frame + 0, to, 6);
	memcpy(dv_frame + 6, from, 6);
	memcpy(dv_frame + 12, &type, 2);
	memcpy(dv_frame + 14, data, size);

	ssize_t ret = send(dv_sock, dv_frame, 14 + size, 0);
	if (ret == 14 + size)
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
		case CODEC2_MODE_700C:
			return (size * 40) / 4;
#ifdef CODEC2_MODE_1300C
		case CODEC2_MODE_1300C:
			return (size * 40) / 7;
#endif
		case 'A':
		case 'U':
			return size / 8;
		case 's':
		case 'S':
			return size / 16;
		default:
			return -1;
	}
}

static int trx_dv_bind_if(void)
{
	short protocol = htons(ETH_P_ALL);
	uint8_t mac[6];
	struct ifreq ifr;

	size_t if_name_len = strlen(dv_dev);
	if (if_name_len >= sizeof(ifr.ifr_name))
		goto err_len;
	strcpy(ifr.ifr_name, dv_dev);

	if (ioctl(dv_sock, SIOCGIFINDEX, &ifr) < 0)
		goto err_ioctl;
	
	int ifindex = ifr.ifr_ifindex;

	struct sockaddr_ll sll = { 0 };
	
	sll.sll_family = AF_PACKET; 
	sll.sll_ifindex = ifindex;
	sll.sll_protocol = protocol;
	if(bind(dv_sock, (struct sockaddr *)&sll , sizeof(sll)) < 0)
		goto err_bind;


	struct ifreq if_mac;

	memset(&if_mac, 0, sizeof(struct ifreq));
	strcpy(if_mac.ifr_name, dv_dev);
	if (ioctl(dv_sock, SIOCGIFHWADDR, &if_mac) < 0)
		goto err_ioctl_mac; 
	memcpy(mac, (uint8_t *)&if_mac.ifr_hwaddr.sa_data, 6);

	if (memcmp(mac, dv_mac, 6)) {
		memcpy(dv_mac, mac, 6);
		dv_mac_cb(dv_mac);
	}

	return 0;

err_ioctl_mac:
err_len:
err_ioctl:
err_bind:
	return -1;
}

static bool dv_bound = false;

static int trx_dv_watchdog(void *arg)
{
	bool bound = !trx_dv_bind_if();
	
	if (!bound && dv_bound) {
		printf("Lost interface\n");
		dml_poll_fd_set(trx_dv_init, -1);
		dml_poll_in_set(trx_dv_init, false);
	}
	if (bound && !dv_bound) {
		printf("Bound to interface\n");
		dml_poll_fd_set(trx_dv_init, dv_sock);
		dml_poll_in_set(trx_dv_init, true);
	}
	dv_bound = bound;
	
	dml_poll_timeout(trx_dv_init, &(struct timespec){ TRX_DV_WATCHDOG, 0});
	return 0;
}

int trx_dv_init(char *dev, 
    int (*new_in_cb)(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode),
    int (*new_ctrl_cb)(void *arg, uint8_t from[6], uint8_t to[6], char *ctrl, size_t size),
    int (*new_fprs_cb)(void *arg, uint8_t from[6], uint8_t *fprs, size_t size),
    void *arg,
    void (*new_mac_cb)(uint8_t *mac))
{
	int sock;
	short protocol = htons(ETH_P_ALL);

	free(dv_dev);
	dv_dev = strdup(dev);
	
	in_cb = new_in_cb;
	in_cb_arg = arg;
	ctrl_cb = new_ctrl_cb;
	fprs_cb = new_fprs_cb;
	dv_mac_cb = new_mac_cb;
	
	sock = socket(AF_PACKET, SOCK_RAW, protocol);
	if (sock < 0)
		goto err_socket;

	dv_sock = sock;

	if (dml_poll_add(trx_dv_init, trx_dv_in_cb, NULL, trx_dv_watchdog))
		goto err_poll;

	if (trx_dv_bind_if()) {
		printf("Failed to connect to interface, trying again later\n");
		dv_bound = false;
		dml_poll_fd_set(trx_dv_init, -1);
		dml_poll_in_set(trx_dv_init, false);
	} else {
		dv_bound = true;
		dml_poll_fd_set(trx_dv_init, sock);
		dml_poll_in_set(trx_dv_init, true);
	}
	dml_poll_timeout(trx_dv_init, &(struct timespec){ TRX_DV_WATCHDOG, 0});

	return 0;

err_poll:
	close(sock);
err_socket:
	return -1;
}
