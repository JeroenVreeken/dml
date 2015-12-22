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
#include "dml_connection.h"
#include "dml_packet.h"
#include "dml_poll.h"

#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdint.h>
#include <errno.h>
#include <string.h>
#include <stdio.h>

enum connection_rx_state {
	CONNECTION_HEADER,
	CONNECTION_PACKET,
};

struct dml_connection {
	int fd;
	enum connection_rx_state rx_state;
	
	uint8_t rx_data[DML_PACKET_SIZE_MAX];
	uint8_t rx_hdr[DML_PACKET_HEADER_SIZE];
	size_t rx_pos;
	size_t rx_len;
	
	uint8_t tx_buf[DML_PACKET_HEADER_SIZE + DML_PACKET_SIZE_MAX];
	size_t tx_pos;
	size_t tx_len;
	
	void *arg;
	void (*rx_cb)(struct dml_connection *, void *, uint16_t id, uint16_t len, uint8_t *data);
	int (*close_cb)(struct dml_connection *, void *);
};

struct dml_connection *dml_connection_create(int fd,
	void *arg,
    	void (*rx_cb)(struct dml_connection *, void *, uint16_t id, uint16_t len, uint8_t *data),
	int (*close_cb)(struct dml_connection *, void *)
)
{
	struct dml_connection *dc;
	int flags;
	
	dc = calloc(1, sizeof(struct dml_connection));
	if (!dc)
		goto err_calloc;

	flags = fcntl(fd, F_GETFL, 0);
	if (flags < 0)
		goto err_fcntl;
	fcntl(fd, F_SETFL, flags | O_NONBLOCK);

	dc->fd = fd;
	dc->rx_state = CONNECTION_HEADER;
	dc->rx_cb = rx_cb;
	dc->close_cb = close_cb;
	dc->arg = arg;

	dml_poll_add(dc, (int (*)(void *))dml_connection_handle, (int (*)(void *))dml_connection_handle, NULL);
//	printf("new connection fd: %d\n", fd);
	dml_poll_fd_set(dc, fd);
	dml_poll_in_set(dc, true);
	dml_poll_out_set(dc, false);

	return dc;
err_fcntl:
	free(dc);
err_calloc:
	return NULL;
}

int dml_connection_destroy(struct dml_connection *dc)
{
//	printf("close %p fd: %d\n", dc, dc->fd);
	close(dc->fd);
	free(dc);
	
	return 0;
}

int dml_connection_fd_get(struct dml_connection *dc)
{
	return dc->fd;
}

int dml_connection_handle(struct dml_connection *dc)
{
//	printf("handle %p\n", dc);
	
	ssize_t r = 0;
	switch (dc->rx_state) {
		case CONNECTION_HEADER: {
			r = read(dc->fd, dc->rx_hdr + dc->rx_pos,
			    DML_PACKET_HEADER_SIZE - dc->rx_pos);
			if (r > 0) {
				dc->rx_pos += r;
			}
			if (dc->rx_pos == DML_PACKET_HEADER_SIZE) {
				dc->rx_state = CONNECTION_PACKET;
				dc->rx_len = dc->rx_hdr[3] + (dc->rx_hdr[2] << 8);
				dc->rx_pos = 0;
			}
			break;
		}
		case CONNECTION_PACKET: {
			r = read(dc->fd, dc->rx_data + dc->rx_pos,
			    dc->rx_len - dc->rx_pos);
			if (r > 0) {
				dc->rx_pos += r;
			}
			if (dc->rx_pos == dc->rx_len) {
				dc->rx_state = CONNECTION_HEADER;
				uint16_t id = dc->rx_hdr[1] + (dc->rx_hdr[0] << 8);
				uint16_t len = dc->rx_len;
				dc->rx_pos = 0;
				
				dc->rx_cb(dc, dc->arg, id, len, dc->rx_data);
			}
			break;
		
		}
	}

	if (r == 0 || (r < 0 && errno != EAGAIN)) {
		dml_poll_remove(dc);
		
		if (dc->close_cb)
			return dc->close_cb(dc, dc->arg);
	}

	if (dc->tx_len) {
		r = write(dc->fd, dc->tx_buf + dc->tx_pos, dc->tx_len - dc->tx_pos);
		if (r >= 0) {
			dc->tx_pos += r;
		}
		if (dc->tx_pos >= dc->tx_len) {
			dml_poll_out_set(dc, false);
			dc->tx_len = 0;
		}
	}
	
	return 0;
}

int dml_connection_send(struct dml_connection *dc, void *datav, uint16_t id, uint16_t len)
{
	uint8_t *data = datav;
	
	if (dc->tx_len)
		return -1;
	
	dc->tx_buf[0] = id >> 8;
	dc->tx_buf[1] = id & 0xff;
	dc->tx_buf[2] = len >> 8;
	dc->tx_buf[3] = len & 0xff;
	
	ssize_t r;

	r = write(dc->fd, dc->tx_buf, 4);
	dc->tx_pos = r >= 0 ? r : 0;
	
	if (r == 4) {
		r = write(dc->fd, data, len);
		if (r < 0)
			r = 0;
	} else {
		r = 0;
	}
	dc->tx_pos += r;
	
	if (dc->tx_pos < len + 4) {
		memcpy(dc->tx_buf + dc->tx_pos, data + r, len - r);
		dml_poll_out_set(dc, true);
		dc->tx_len = len + 4;
	}

	return 0;
}

bool dml_connection_send_empty(struct dml_connection *dc)
{
	return !dc->tx_len;
}

int dml_connection_send_data(struct dml_connection *dc, void *datav, uint16_t id, uint16_t len)
{
	// For now we just map to the control connection, add UDP stuff later...
	return dml_connection_send(dc, datav, id, len);
}
