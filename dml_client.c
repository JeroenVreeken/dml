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
#define _GNU_SOURCE

#include <dml/dml_client.h>
#include <dml/dml_server.h>
#include <dml/dml_log.h>
#include <dml_config.h>

#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <string.h>
#include <netdb.h>
#include <signal.h>
#include <resolv.h>
#include <errno.h>

struct dml_client {
	int fd;
	GIOChannel *io;
	
	char *host;
	char *service;
	struct addrinfo hints;
	struct gaicb req;
	
	bool req_started;
	
	void (*connect_cb)(struct dml_client *dc, void *arg);
	void *arg;
};

struct dml_client *dml_client_create(char *host, unsigned short port, void (*cb)(struct dml_client *dc, void *arg), void *arg)
{
	struct dml_client *dc;
	
	signal(SIGPIPE, SIG_IGN);

	if (!port)
		port = DML_SERVER_PORT;
	
	dc = calloc(1, sizeof(struct dml_client));
	if (!dc)
		goto err_calloc;

	
	if (asprintf(&dc->service, "%d", port) < 0)
		goto err_asprintf;


	dc->host = strdup(host);
	if (!dc->host)
		goto err_strdup;

	dc->fd = -1;
	dc->io = NULL;
	dc->connect_cb = cb;
	dc->arg = arg;
	
	return dc;
err_strdup:
	free(dc->service);
err_asprintf:
	free(dc);
err_calloc:
	return NULL;
}

int dml_client_destroy(struct dml_client *dc)
{
	if (dc->fd >= 0)
		close(dc->fd);
	g_io_channel_unref(dc->io);
	
	free(dc->host);
	free(dc);
	
	return 0;
}


static gboolean dml_client_connect_success(GIOChannel *source, GIOCondition condition, gpointer arg)
{
	struct dml_client *dc = arg;

	g_source_remove_by_user_data(dc);

	setsockopt (dc->fd, IPPROTO_TCP, TCP_NODELAY, &(int){1}, sizeof (int));
	setsockopt (dc->fd, SOL_SOCKET, SO_KEEPALIVE, &(int){1}, sizeof (int));
#ifdef TCP_KEEPINTVL
	setsockopt (dc->fd, IPPROTO_TCP, TCP_KEEPIDLE, &(int){60}, sizeof(int));
#endif

	dc->connect_cb(dc, dc->arg);

	//TODO
	return FALSE;
}

int dml_client_connect(struct dml_client *dc)
{
	struct addrinfo *result;
	struct addrinfo *entry;
	int error;
	int sock = -1;
	
	dc->hints.ai_family = AF_UNSPEC;
	dc->hints.ai_socktype = SOCK_STREAM;
	
	dc->req.ar_name = dc->host;
	dc->req.ar_service = dc->service;
	dc->req.ar_request = &dc->hints;
	
	if (!dc->req_started) {
		struct gaicb *req_list[1] = { &dc->req };
	
		dml_log(DML_LOG_DEBUG, "Start address resolve");
		error = getaddrinfo_a(GAI_NOWAIT, req_list, 1, NULL);
		if (error) {
			res_init();
			goto err_getaddrinfo;
		}
		
		dc->req_started = true;
	}
	
	struct gaicb const *wait_list[1] = { &dc->req };
	
	dml_log(DML_LOG_DEBUG, "Continue address resolve");
	error = gai_suspend(wait_list, 1, &(struct timespec){0, 0});
	if (error && error != EAI_ALLDONE) {
		int req_error = gai_error(&dc->req);
		dml_log(DML_LOG_DEBUG, "Address resolve failed: %d req: %d", error, req_error);
		if (error != EAI_AGAIN && req_error != EAI_INPROGRESS && req_error) {
			gai_cancel(&dc->req);
			dc->req_started = false;
			dml_log(DML_LOG_DEBUG, "Address resolve canceled");
		}
		goto err_getaddrinfo;
	}
	dml_log(DML_LOG_DEBUG, "Address resolved");
	dc->req_started = false;
	
	result = dc->req.ar_result;
	
	for (entry = result; entry; entry = entry->ai_next) {
		if (entry->ai_family == AF_INET6) {
			bool ipv6 = atoi(dml_config_value("ipv6", NULL, "1"));
			if (!ipv6) {
				continue;
			}
		}
		sock = socket(entry->ai_family, entry->ai_socktype,
		    entry->ai_protocol);
		if (sock >= 0) {
			int flags = fcntl(sock, F_GETFL, 0);
			if (flags >= 0)
				fcntl(sock, F_SETFL, flags | O_NONBLOCK);

			if (connect(sock, entry->ai_addr, entry->ai_addrlen) &&
			    errno != EINPROGRESS) {
				dml_log(DML_LOG_ERROR, "connect failed %d", errno);
				close(sock);
				sock = -1;
			} else {
				break;
			}
		}
	}
	freeaddrinfo(result);
	
	if (sock < 0)
		goto err_connect;
	
	dc->fd = sock;
	dc->io = g_io_channel_unix_new (sock);
	g_io_channel_set_encoding(dc->io, NULL, NULL);
	
	g_io_add_watch(dc->io, G_IO_OUT, dml_client_connect_success, dc);
	
	return 0;

err_connect:
err_getaddrinfo:
	return -1;
}

int dml_client_fd_get(struct dml_client *dc)
{
	return dc->fd;
}

