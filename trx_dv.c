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
#include "eth_ar.h"
#include "dml_poll.h"

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

static int (*in_cb)(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode) = NULL;
static void *in_cb_arg = NULL;

static int trx_dv_in_cb(void *arg)
{
	uint8_t dv_frame[6 + 6 + 2 + 8];
	ssize_t ret;
	
	ret = recv(dv_sock, dv_frame, sizeof(dv_frame), 0);
	if (ret == sizeof(dv_frame)) {
		in_cb(in_cb_arg, dv_frame + 6, dv_frame, dv_frame + 14, 8, CODEC2_MODE_3200);
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

int trx_dv_send(uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size)
{
	uint8_t dv_frame[6 + 6 + 2 + size];
	uint16_t type = htons(ETH_P_CODEC2_3200);
	
	memcpy(dv_frame + 0, to, 6);
	memcpy(dv_frame + 6, from, 6);
	memcpy(dv_frame + 12, &type, 2);
	memcpy(dv_frame + 14, dv, size);
	
	ssize_t ret = send(dv_sock, dv_frame, 14 + size, 0);
	if (ret == 14 + size)
		return 0;
	
	return -1;
}

int trx_dv_init(char *dev, 
    int (*new_in_cb)(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode), void *arg)
{
	int sock;
	short protocol = htons(ETH_P_CODEC2_3200);
	
	in_cb = new_in_cb;
	in_cb_arg = arg;
	
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
