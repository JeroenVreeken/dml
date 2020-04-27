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

#include <eth_ar/fprs.h>

#include <poll.h>
#include <errno.h>
#include <ctype.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <netdb.h>
#include <errno.h>
#include <time.h>
#include <resolv.h>
#include <sys/ioctl.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/select.h>

#ifdef __linux__
#include <linux/sockios.h>
#endif

#include <dml/dml.h>
#include "fprs_aprsis.h"

static int fd_is = -1;
static GIOChannel *io_is = NULL;
static int to_is = 0;
static int from_is = 0;

static char *call = NULL;
static char *is_host = NULL;
static int is_port;

static gboolean aprs_is_cb(GIOChannel *source, GIOCondition condition, gpointer arg);

static bool filter_type_message = false;
static void (*message_cb)(struct fprs_frame *) = NULL;

static int tcp_connect(char *host, int port)
{
	struct addrinfo *result;
	struct addrinfo *entry;
	struct addrinfo hints = { 0 };
	int error;
	int sock = -1;
	char port_str[10];
	int tcp_connect_timeout = 1;
	
	sprintf(port_str, "%d", port);

	hints.ai_family = AF_UNSPEC;
	hints.ai_socktype = SOCK_STREAM;
	
	error = getaddrinfo(host, port_str, &hints, &result);
	if (error) {
		fprintf(stderr, "getaddrinfo: %s (%s:%s)\n", gai_strerror(error), host, port_str);
		
		res_init();
		
		return -1;
	}
	
	for (entry = result; entry; entry = entry->ai_next) {
		int flags;
		
		sock = socket(entry->ai_family, entry->ai_socktype,
		    entry->ai_protocol);
		flags = fcntl(sock, F_GETFL, 0);
		fcntl(sock, F_SETFL, flags | O_NONBLOCK);
		if (sock >= 0) {
			fd_set fdset_tx, fdset_err;
			struct timeval tv;
			
			tv.tv_sec = tcp_connect_timeout;
			tv.tv_usec = 0;
			
			if (connect(sock, entry->ai_addr, entry->ai_addrlen)) {
				int ret;
				do {
				    errno = 0;
				    FD_ZERO(&fdset_tx);
				    FD_ZERO(&fdset_err);
				    FD_SET(sock, &fdset_tx);
				    FD_SET(sock, &fdset_err);
				    tv.tv_sec = tcp_connect_timeout;
				    tv.tv_usec = 0;
				    ret = select(sock+1, NULL, &fdset_tx, NULL,
				    &tv);
				} while (
				    ret < 0 
				    &&
				    (errno == EAGAIN || errno == EINTR ||
				     errno == EINPROGRESS));
				
				int error = 0;
				socklen_t len = sizeof (error);
				int retval = getsockopt (sock, SOL_SOCKET, SO_ERROR,
				    &error, &len );
				if (!retval && error) {
					close(sock);
					sock = -1;
				}
			}

			if (sock >= 0) {
				flags = fcntl(sock, F_GETFL, 0);
				fcntl(sock, F_SETFL, flags & ~O_NONBLOCK);
				
				setsockopt(sock, SOL_SOCKET, SO_KEEPALIVE,
				    &(int){1}, sizeof(int));

#ifdef __linux__
				/* number of probes which may fail */
				setsockopt(sock, SOL_TCP, TCP_KEEPCNT,
				    &(int){5}, sizeof(int));
				/* Idle time before starting with probes */
				setsockopt(sock, SOL_TCP, TCP_KEEPIDLE,
				    &(int){10}, sizeof(int));
				/* interval between probes */
				setsockopt(sock, SOL_TCP, TCP_KEEPINTVL,
				    &(int){2}, sizeof(int));
#endif
				
				break;
			}
		}
	}
	freeaddrinfo(result);
	
	return sock;
}

static int aprsis_open(void)
{
	printf("Opening connection to APRS-IS\n");
	
	fd_is = tcp_connect(is_host, is_port);
	if (fd_is < 0)
		return -1;

	char loginline[256];
	size_t loginline_len = sizeof(loginline) - 1;
	fprs2aprs_login(loginline, &loginline_len, call);
	if (write(fd_is, loginline, strlen(loginline)) <= 0)
		goto err_write;
	
	if (filter_type_message) {
		char *filter = "#filter t/m\r\n";
		if (write(fd_is, filter, strlen(filter)) <= 0)
			goto err_write;
	}

	io_is = g_io_channel_unix_new(fd_is);
	printf("io_is = %p\n", io_is);
	to_is = 0;
	from_is = 0;
	g_io_channel_set_encoding(io_is, NULL, NULL);
	g_io_add_watch(io_is, G_IO_IN, aprs_is_cb, fprs_aprsis_init);

	return 0;
err_write:
	close(fd_is);
	fd_is = -1;
	printf("Writing to APRS-IS failed");
	return -1;
}

static void aprs_is_error(void)
{
	close(fd_is);
	fd_is = -1;
	
	g_source_remove_by_user_data(fprs_aprsis_init);
	g_io_channel_unref(io_is);
	io_is = NULL;

	printf("Lost connection to APRS-IS (to is: %d, from is: %d)\n", to_is, from_is);

	/* Fist attempt to reconnect: */
	aprsis_open();
}

static gboolean aprs_is_cb(GIOChannel *source, GIOCondition condition, gpointer arg)
{
	static char buffer[1000];
	static size_t pos;
	ssize_t r;
	
	r = read(fd_is, buffer + pos, 1000 - pos);
//	printf("------------------------------------- %zd ----- %zd\n", pos, r);
	if (r > 0) {
		int i;
		char *line = buffer;
		for (i = 0; i < r + pos; i++) {
			if (buffer[i] == '\r' ||
			    buffer[i] == '\n') {
				buffer[i] = 0;
				if (strlen(line)) {
//					printf("%s\n", line);
					struct fprs_frame *frame = aprs2fprs(buffer);
					if (frame) {
						if (message_cb) {
							from_is++;
							message_cb(frame);
						}
						fprs_frame_destroy(frame);
					}
				}
				line = buffer + i + 1;
			}
		}
		pos = i - (line - buffer);
		if (line != buffer + i) {
			memmove(buffer, line, i - pos);
		}
	} else {
		if (r == 0) {
			printf("Read from aprsis failed\n");
			aprs_is_error();
		}
		return FALSE;
	}
	
	return TRUE;
}

int fprs_aprsis_frame(struct fprs_frame *frame, uint8_t *from)
{
	if (fd_is < 0) {
		aprsis_open();
		if (fd_is < 0)
			return -1;
	}
	
	char aprs[256] = { 0 };
	size_t aprs_size = 255;
	
	if (fprs2aprs(aprs, &aprs_size, frame, from, call)) {
		printf("Could not convert to APRS-IS frame\n");
		return -1;
	}

	printf("%s", aprs);
	if (write(fd_is, aprs, strlen(aprs)) <= 0) {
		printf("Write to aprsis failed\n");
		aprs_is_error();
		return -1;
	} else {
		to_is++;
	}

	return 0;
}

int fprs_aprsis_init(char *host, int port, char *mycall, bool req_msg, void (*msg_cb)(struct fprs_frame *))
{
	if (fd_is >= 0) {
		close(fd_is);
		fd_is = -1;
		g_io_channel_unref(io_is);
		io_is = NULL;
	
		g_source_remove_by_user_data(fprs_aprsis_init);
	}
	free(is_host);
	free(call);
	is_host = strdup(host);
	is_port = port;
	call = strdup(mycall);
	filter_type_message = req_msg;
	message_cb = msg_cb;

	int i;
		
	for (i = 0; i < strlen(call); i++) {
		call[i] = toupper(call[i]);
	}

	return aprsis_open();
}
