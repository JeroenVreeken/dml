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

#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <stdarg.h>
#include <poll.h>
#include <errno.h>
#include <time.h>
#include <magic.h>
#include <libwebsockets.h>
#include <sys/ioctl.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <dirent.h>

#include "dml_client.h"
#include "dml_config.h"
#include "dml_connection.h"
#include "dml_packet.h"
#include "dml_poll.h"

magic_t magic;

char *cgi_path;
char *htdocs;
unsigned short port;
char *dml_host;

struct libwebsocket_context *lws_context;

struct writebuf {
	char *data;
	char *msg;
	size_t msg_len;
	
	struct writebuf *next;
};

struct ws_client {
	struct libwebsocket_context *context;
	struct libwebsocket *wsi;
	
	struct writebuf *writeq;

	/* dml specific data here */
	struct dml_connection *dc;
	bool dml_closed;
	
	struct ws_client *next;
};

struct writebuf *writebuf_alloc(size_t msglen)
{
	struct writebuf *wb;
	
	wb = malloc(sizeof(struct writebuf));
	if (!wb)
		return NULL;
	
	wb->data = malloc(msglen +
	    LWS_SEND_BUFFER_PRE_PADDING +
	    LWS_SEND_BUFFER_POST_PADDING);

	wb->msg = wb->data + LWS_SEND_BUFFER_PRE_PADDING;

	return wb;
}

void writebuf_free(struct writebuf *wb)
{
	free(wb->data);
	free(wb);
}

void writebuf_add(struct ws_client *client, struct writebuf *wb)
{
	struct writebuf **entry;
	
	for (entry = &client->writeq; *entry; entry = &(*entry)->next);
	
	*entry = wb;
	wb->next = NULL;
}

struct writebuf *writebuf_next(struct ws_client *client)
{
	struct writebuf *wb;
	
	if (!client->writeq)
		return NULL;
	
	wb = client->writeq;
	client->writeq = wb->next;
	
	return wb;
}

struct ws_client *ws_client_list = NULL;

struct ws_client *ws_client_add(struct libwebsocket_context *context, struct libwebsocket *wsi)
{
	struct ws_client *client;
	
	client = calloc(sizeof(struct ws_client), 1);
	if (!client)
		return NULL;
	
	client->context = context;
	client->wsi = wsi;
	
	client->next = ws_client_list;
	ws_client_list = client;
	
	return client;
}

void ws_client_remove(struct ws_client *client)
{
	struct ws_client **entry;
	
	for (entry = &ws_client_list; *entry; entry = &(*entry)->next) {
		if (*entry == client) {
			struct writebuf *wb;
			while ((wb = writebuf_next(client))) {
				writebuf_free(wb);
			}
			
			dml_connection_destroy(client->dc);
			
/*			printf("close srcp connections\n");
			poll_remove(srcp_fd_get((*entry)->srcp_cmd));
			poll_remove(srcp_fd_get((*entry)->srcp_info));
			srcp_destroy(client->srcp_info);
			srcp_destroy(client->srcp_cmd);
*/			
			*entry = (*entry)->next;
			free(client);
			return;
		}
	}
}

struct ws_client *ws_client_get_by_wsi(struct libwebsocket *wsi)
{
	struct ws_client *entry;
	
	for (entry = ws_client_list; entry; entry = entry->next)
		if (entry->wsi == wsi)
			return entry;
	
	printf("wsi %p not found\n", wsi);
	return NULL;
}


struct ws_client *ws_client_get_by_dc(struct dml_connection *dc)
{
	struct ws_client *entry;
	
	for (entry = ws_client_list; entry; entry = entry->next) {
		if (entry->dc == dc)
			return entry;
	}
	
	printf("dc %p not found\n", dc);
	return NULL;
}


void ws_client_flush(struct ws_client *client)
{
	while (client->writeq) {
		struct writebuf *wb;
		
		if (lws_send_pipe_choked(client->wsi))
			break;
		
		wb = writebuf_next(client);

		libwebsocket_write(client->wsi, (unsigned char *)wb->msg, wb->msg_len, LWS_WRITE_BINARY);

		writebuf_free(wb);
	}
	
	if (client->writeq) {
		libwebsocket_callback_on_writable(client->context, client->wsi);
	}
}


//#define LINEBUF_SIZE 8192
#define READ_SIZE 4096

int exec_cgi(struct libwebsocket *wsi, char *requested_uri, char *resource_path)
{
	FILE *fpipe;
	unsigned char *outdata = NULL;
	size_t pos = 0, r;
	char *wd = get_current_dir_name();
	
	chdir(cgi_path);
	
	fpipe = popen(resource_path, "r");
	if (!fpipe) {
		free(wd);
		return -1;
	}
	
	do {
		outdata = realloc(outdata, pos + READ_SIZE);
		r = fread(outdata + pos, 1, READ_SIZE, fpipe);
		if (r > 0) {
			pos += r;
		}
	} while (r > 0);
	
	if (!lws_send_pipe_choked(wsi))
		libwebsocket_write(wsi, outdata, pos, LWS_WRITE_HTTP);
	
	pclose(fpipe);
	free(outdata);
	free(wd);
	
	return -1;
}

void rx_packet(struct dml_connection *dc, void *arg, 
    uint16_t id, uint16_t len, uint8_t *data)
{
	uint8_t *msg;
	struct ws_client *ws_client;
	struct writebuf *wb;
	
//	printf("Received packet, id %d, len %d\n", id, len);
	ws_client = ws_client_get_by_dc(dc);
	wb = writebuf_alloc(len + 4);
	msg = (uint8_t *)wb->msg;
	wb->msg_len = len + 4;
	memcpy(msg + 4, data, len);
	msg[0] = id >> 8;
	msg[1] = id & 0xff;
	msg[2] = len >> 8;
	msg[3] = len & 0xff;

	writebuf_add(ws_client, wb);
	ws_client_flush(ws_client);
}

int list_dir(struct libwebsocket_context *context, struct libwebsocket *wsi, char *requested_uri, char *resource_path)
{
	unsigned char *outdata = malloc(1000);
	size_t pos = 0;
	struct dirent **namelist;
	int n, i;
	unsigned char *h = outdata;
	char *server = "dml_httpd libwebsockets";
	char *type = "text/html";
	
	if (lws_add_http_header_status(context, wsi, 200, &h, outdata + 1000))
		return 1;
	if (lws_add_http_header_by_token(context, wsi,
	    WSI_TOKEN_HTTP_SERVER,
	    (unsigned char *)server, strlen(server), &h, outdata + 1000))
		return 1;
	if (lws_add_http_header_by_token(context, wsi,
	    WSI_TOKEN_HTTP_CONTENT_TYPE,
	    (unsigned char *)type, strlen(type), &h, outdata + 1000))
		return 1;
	if (lws_finalize_http_header(context, wsi, &h, outdata + 1000))
		return 1;
	pos += h - outdata;

	libwebsocket_write(wsi, outdata, pos, LWS_WRITE_HTTP_HEADERS);
	free(outdata);
	outdata = NULL;
	pos = 0;

	n = scandir(resource_path, &namelist, NULL, alphasort);
	for (i = 0; i < n; i++) {
		errno = 0;

		if (namelist[i]->d_type != DT_REG) {
			printf("%s is not a regular file\n", namelist[i]->d_name);
			continue;
		}
				
		char *line;
		asprintf(&line, "<a href='%s'>%s</a><br>\n", 
		    namelist[i]->d_name, namelist[i]->d_name);
		
		outdata = realloc(outdata, pos + strlen(line) + 1);
		strcpy((char*)outdata + pos, line);
		pos += strlen(line);
		free(line);
	}
	if (n >= 0)
		free(namelist);
	
	if (!lws_send_pipe_choked(wsi))
		libwebsocket_write(wsi, outdata, pos, LWS_WRITE_HTTP);
	
	free(outdata);
	
	return -1;
}

int client_connection_close(struct dml_connection *dc, void *arg)
{
	struct libwebsocket *wsi = arg;
	struct ws_client *ws_client;
			
	printf("Connection to DML server closed\n");
	ws_client = ws_client_get_by_wsi(wsi);
	ws_client->dml_closed = true;
	
	libwebsocket_callback_on_writable(lws_context, wsi);

	return 0;
}

void client_connect(struct dml_client *client, void *arg)
{
	struct dml_connection *dc;
	struct libwebsocket *wsi = arg;
	int fd;
	struct ws_client *ws_client;
			
	ws_client = ws_client_get_by_wsi(wsi);
	
	fd = dml_client_fd_get(client);
	
	dc = dml_connection_create(fd, arg, rx_packet, client_connection_close);
	dml_packet_send_hello(dc, DML_PACKET_HELLO_UPDATES, "dml_httpd " DML_VERSION);

	ws_client->dc = dc;
}

int wsi_in_cb(void *arg)
{
//	struct libwebsocket *wsi = arg;
	libwebsocket_service(lws_context, 0);

	return 0;
}
int wsi_out_cb(void *arg)
{
//	struct libwebsocket *wsi = arg;
	libwebsocket_service(lws_context, 0);

	return 0;
}


static int callback_http(struct libwebsocket_context *context,
                         struct libwebsocket *wsi,
                         enum libwebsocket_callback_reasons reason, void *user,
                         void *in, size_t len)
{
	int r = 0;
	
	switch (reason) {
		case LWS_CALLBACK_ESTABLISHED: {
			struct ws_client *ws_client;
			printf("lws established\n");
			
			ws_client = ws_client_get_by_wsi(wsi);
			if (!ws_client) {
				ws_client = ws_client_add(context, wsi);
			}

			struct dml_client *dc;
			
			dc = dml_client_create(dml_host, 0, client_connect, wsi);

			if (dml_client_connect(dc)) {
				printf("Could not connect to server\n");
				return -1;
			}

			break;
		}
		case LWS_CALLBACK_RECEIVE: {
			uint8_t *rcv = in;
			struct ws_client *ws_client;
//			printf("lws receive: %zd\n", len);
			
			ws_client = ws_client_get_by_wsi(wsi);
			if (!ws_client) {
				ws_client = ws_client_add(context, wsi);
			}
						
			uint8_t *payload_data = rcv + 4;
			ssize_t data_len = len - 4;
			uint16_t packet_id = (rcv[0] << 8) | rcv[1];
			
			if (data_len > 0) {
				printf("Send packet (id %d, len %zd)\n", packet_id, data_len);
				dml_connection_send(ws_client->dc, payload_data, packet_id, data_len);
			}
			
			break;
		}
		case LWS_CALLBACK_CLOSED:
			ws_client_remove(ws_client_get_by_wsi(wsi));
			printf("Close connection %p\n", wsi);
			break;

		case LWS_CALLBACK_HTTP: {
			char *requested_uri = (char *) in;
			int i;
			printf("requested URI: %s ", requested_uri);
           
	   		for (i = 0; strlen(in) > 4 && i < strlen(in) - 3; i++) {
				/* Don't go outside the htdocs dir */
				if (!strncmp(in + i, "/../", 4))
					break;
			}
	   
			if (strcmp(requested_uri, "/") == 0) {
				requested_uri = "/index.html";
			}
			char *cwd;
			cwd = htdocs;

			char *resource_path;
			struct stat statbuf;
			
			resource_path = malloc(strlen(cwd) + strlen(requested_uri) + 1);
                   
			sprintf(resource_path, "%s%s", cwd, requested_uri);
			printf("resource path: %s\n", resource_path);
			stat(resource_path, &statbuf);
			
			if (S_ISDIR(statbuf.st_mode)) {
				r = list_dir(context, wsi, requested_uri, resource_path);
			} else if (!strcmp(
			    resource_path + strlen(resource_path) - strlen(".cgi"),
			    ".cgi")) {
				r = exec_cgi(wsi, requested_uri, resource_path);
			} else {
				const char *mime;
				
				if (!strcmp(
				    resource_path + strlen(resource_path) - strlen(".js"),
				    ".js"))
					mime = "application/javascript";
				else
					mime = magic_file(magic, resource_path);

				r = libwebsockets_serve_http_file(context, wsi, 
				    resource_path, mime, NULL, 0);
                   	}
			
			free(resource_path);
			break;
		}

		case LWS_CALLBACK_ADD_POLL_FD: {
			struct libwebsocket_pollargs *args = in;
			dml_poll_add(wsi, wsi_in_cb, wsi_out_cb, NULL);
			dml_poll_fd_set(wsi, args->fd);
			dml_poll_in_set(wsi, args->events & POLLIN);
			dml_poll_out_set(wsi, args->events & POLLOUT);
			break;
		}
		case LWS_CALLBACK_DEL_POLL_FD: {
		
			dml_poll_remove(wsi);
			break;
		}
		case LWS_CALLBACK_CHANGE_MODE_POLL_FD: {
			struct libwebsocket_pollargs *args = in;
		
			dml_poll_fd_set(wsi, args->fd);
			dml_poll_in_set(wsi, args->events & POLLIN);
			dml_poll_out_set(wsi, args->events & POLLOUT);
			break;
		}

		case LWS_CALLBACK_SERVER_WRITEABLE: {
			struct ws_client *ws_client;
			
			ws_client = ws_client_get_by_wsi(wsi);
			if (ws_client) {
				ws_client_flush(ws_client);
				if (ws_client->dml_closed)
					r = -1;
			}
			break;
		}

	        default:
//			if (reason != 30)
//				printf("unhandled callback (%d)\n", reason);
			break;
	}

	return r;
}

static struct libwebsocket_protocols protocols[] = {
    // first protocol must always be HTTP handler
    {
        name: "http-only",        // name
        callback: callback_http,      // callback
        per_session_data_size: 0,                   // per_session_data_size
	rx_buffer_size: 65536,
    },
    {
        NULL, NULL, 0       // end of list
    }
};

int main(int argc, char **argv)
{
	char *file = "dml_httpd.conf";

	if (argc > 1)
		file = argv[1];

	if (dml_config_load(file)) {
		printf("Failed to load config file %s\n", file);
		return -1;
	}
	cgi_path = dml_config_value("cgi_path", NULL, ".");
	htdocs = dml_config_value("htdocs", NULL, ".");
	port = atoi(dml_config_value("port", NULL, "8080"));
	dml_host = dml_config_value("dml_host", NULL, "localhost");

	magic = magic_open(MAGIC_MIME_TYPE);
	if (magic_load(magic, NULL))
		printf("magic_load failed\n");

	struct lws_context_creation_info creation_info = {
		.port = port,
		.iface = NULL,
		.protocols = protocols,
		.gid = -1,
		.uid = -1,
	};
    
	lws_context = libwebsocket_create_context(&creation_info);
    
	if (lws_context == NULL) {
		fprintf(stderr, "libwebsocket init failed\n");
		return -1;
	}
    
	printf("starting server...\n");
    
	
	dml_poll_loop();
    
	libwebsocket_context_destroy(lws_context);
	magic_close(magic);
    
	return 0;
}
