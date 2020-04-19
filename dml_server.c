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
#include <dml/dml_server.h>

#include <string.h>
#include <malloc.h>
#include <unistd.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>


struct dml_server {
	int fd;
	GIOChannel *io;
	void (*connection_cb)(void *arg, int fd);
	void *connection_cb_arg;
};

struct dml_server *dml_server_create(void (*cb)(void *arg, int fd), void *arg)
{
	struct dml_server *ds;
	struct sockaddr_in6 sin6;
	int listensock6;

	signal(SIGPIPE, SIG_IGN);

	memset(&sin6, 0, sizeof(sin6));

	sin6.sin6_family = AF_INET6;
	sin6.sin6_port = htons(DML_SERVER_PORT);
	sin6.sin6_addr = in6addr_any;
	
	listensock6 = socket(AF_INET6, SOCK_STREAM, 0);
	if (listensock6 < 0)
		goto err_socket;

	setsockopt (listensock6, SOL_SOCKET, SO_REUSEADDR, &(int){1}, sizeof (int));

	if (bind(listensock6, (struct sockaddr *)&sin6, sizeof(sin6)) < 0)
		goto err_bind;
	
	listen(listensock6, 10);
	
	ds = calloc(1, sizeof(struct dml_server));
	if (!ds)
		goto err_calloc;
	
	ds->fd = listensock6;
	ds->io = g_io_channel_unix_new (listensock6);
	g_io_channel_set_encoding(ds->io, NULL, NULL);
	ds->connection_cb = cb;
	ds->connection_cb_arg = arg;

	g_io_add_watch(ds->io, G_IO_IN, dml_server_handle, ds);

	return ds;
err_calloc:
err_bind:
	close(listensock6);
err_socket:
	return NULL;
}

int dml_server_fd_get(struct dml_server *ds)
{
	return ds->fd;
}

gboolean dml_server_handle(GIOChannel *source, GIOCondition condition, gpointer arg)
{
	struct dml_server *ds = arg;
	int acceptsock;
	struct sockaddr_in6 from6;
	socklen_t len6 = sizeof(from6);
	
	acceptsock = accept(ds->fd, (struct sockaddr *)&from6, &len6);
	
	if (acceptsock < 0)
		return TRUE;
	
	setsockopt(acceptsock, SOL_SOCKET, SO_REUSEADDR, &(int){1}, sizeof (int));
	setsockopt(acceptsock, IPPROTO_TCP, TCP_NODELAY, &(int){1}, sizeof (int));
	setsockopt(acceptsock, SOL_SOCKET, SO_KEEPALIVE, &(int){1}, sizeof (int));
#ifdef TCP_KEEPINTVL
	setsockopt(acceptsock, IPPROTO_TCP, TCP_KEEPIDLE, &(int){60}, sizeof(int));
#endif

	ds->connection_cb(ds->connection_cb_arg, acceptsock);

	return TRUE;
}

