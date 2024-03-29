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
#include <dml/dml_client.h>
#include <dml/dml_connection.h>
#include <dml/dml_packet.h>
#include <dml/dml.h>
#include <dml/dml_id.h>
#include <dml/dml_crypto.h>
#include <dml/dml_stream.h>
#include <dml/dml_log.h>
#include <dml_config.h>
#include <dml_stream_client_simple.h>

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>

#define DML_STREAM_CLIENT_SIMPLE_KEEPALIVE 120
#define DML_STREAM_CLIENT_SIMPLE_RECONNECT 10

struct dml_stream_client_simple {
	bool header_written;
	struct dml_client *client;
	struct dml_connection *dc;

	bool found_req_id;
	uint8_t req_id[DML_ID_SIZE];
	bool verify;

	void *arg;
	int (*data_cb)(void *arg, void *data, size_t datasize);
	
	void *mime_cb_arg;
	void (*mime_cb)(void *arg, char *mime);

	void *header_cb_arg;
	void (*header_cb)(void *arg, void *, size_t);
	
	char *name;
	char *alias;
	char *mime;
};

static gboolean keepalive_cb(void *arg)
{
	struct dml_stream_client_simple *dss = arg;
	
	if (!dss->dc) {
		return 0;
	}
	
	if (dss->found_req_id) {
		dml_log(DML_LOG_INFO, "No data for %d seconds, send keepalive connect", DML_STREAM_CLIENT_SIMPLE_KEEPALIVE);
		dml_packet_send_connect(dss->dc, dss->req_id, DML_PACKET_DATA);
	} else {
		//TODO What is the best way to trigger discovery?
	}
	
	g_timeout_add_seconds(DML_STREAM_CLIENT_SIMPLE_KEEPALIVE, keepalive_cb, dss);

	return G_SOURCE_REMOVE;
}

static void rx_packet(struct dml_connection *dc, void *arg, 
    uint16_t id, uint16_t len, uint8_t *data)
{
	struct dml_stream_client_simple *dss = arg;

//	dml_log(DML_LOG_DEBUG, "got id: %d", id);
	switch(id) {
		case DML_PACKET_ROUTE: {
			if (dss->found_req_id)
				break;
			
			uint8_t id[DML_ID_SIZE];
			uint8_t hops;
			
			dml_packet_parse_route(data, len, id, &hops);
			
			if (hops < 255) {
				dml_packet_send_req_description(dc, id);
			}
		}
		case DML_PACKET_DESCRIPTION: {
			uint8_t desc_id[DML_ID_SIZE];
			uint8_t version;
			uint32_t bps;
			char *mime, *name, *alias, *description;
	
			if (dml_packet_parse_description(data, len, desc_id, &version, 
			    &bps, &mime, &name, &alias, &description))
				break;
				
			if (!dss->found_req_id) {
				bool found = true;
				if (dss->name && strcmp(name, dss->name))
					found = false;
				if (dss->alias && strcmp(alias, dss->alias))
					found = false;
				if (dss->mime && strcmp(mime, dss->mime))
					found = false;
				
				if (found) {
					dss->found_req_id = true;
					memcpy(dss->req_id, desc_id, DML_ID_SIZE);
				}
			}
			
			if (dss->found_req_id && !memcmp(desc_id, dss->req_id, DML_ID_SIZE)) {
				if (!dml_stream_update_description(data, len, NULL))
					break;
		
				dml_log(DML_LOG_DEBUG, "Request certificate");
				dml_packet_send_req_certificate(dc, dss->req_id);
				if (dss->mime_cb) {
					dss->mime_cb(dss->mime_cb_arg, mime);
				}
			}
			break;
		}
		case DML_PACKET_CERTIFICATE: {
			uint8_t cid[DML_ID_SIZE];
			void *cert;
			size_t size;
			
			dml_log(DML_LOG_DEBUG, "Parse certificate");
			if (dml_packet_parse_certificate(data, len, cid, &cert, &size)) {
				dml_log(DML_LOG_ERROR, "Failed to parse certificate");
				break;
			}
			
			if (!memcmp(cid, dss->req_id, DML_ID_SIZE)) {
				dml_log(DML_LOG_DEBUG, "verify %d", dss->verify);
				if (!dss->verify || !dml_crypto_cert_add_verify(cert, size, cid)) {
					dml_log(DML_LOG_DEBUG, "Request header");
					dml_packet_send_req_header(dc, dss->req_id);
				} else {
					dml_log(DML_LOG_ERROR, "Certificate not accepted");
				}
			}
			free(cert);
			
			break;
		}
		case DML_PACKET_HEADER: {
			uint8_t hid[DML_ID_SIZE];
			uint8_t sig[DML_SIG_SIZE];
			void *header;
			size_t header_size;
			struct dml_stream *ds;
			struct dml_crypto_key *dk;
			bool send_connect = false;
			
			if (dml_packet_parse_header(data, len, hid, sig, &header, &header_size))
				break;
			
			if ((ds = dml_stream_by_id(hid))) {
				if (!dss->verify) {
					send_connect = true;
				} else if ((dk = dml_stream_crypto_get(ds))) {
					bool verified = dml_crypto_verify(header, header_size, sig, dk);
			
					if (verified) {
						send_connect = true;
					} else {
						dml_log(DML_LOG_ERROR, "Failed to verify header signature (%zd bytes)", header_size);
					}
				}
			}
			
			if (send_connect) {
				if (dss->header_cb) {
					dss->header_cb(dss->header_cb_arg, header, header_size);
				} else {
					dss->data_cb(dss->arg, header, header_size);
				}
				dss->header_written = true;
		
				dml_stream_data_id_set(ds, DML_PACKET_DATA);
				dml_packet_send_connect(dc, dss->req_id, DML_PACKET_DATA);
				dml_log(DML_LOG_DEBUG, "Send connect");
			}
			
			free(header);
			
			break;
		}
		default: {
			if (id < DML_PACKET_DATA)
				break;
			if (len < DML_SIG_SIZE + sizeof(uint64_t))
				break;
			
			uint64_t timestamp;
			size_t payload_len;
			void *payload_data;
			struct dml_crypto_key *dk;
			struct dml_stream *ds;
			
			ds = dml_stream_by_data_id(id);
			if (!ds) {
				dml_log(DML_LOG_ERROR, "Could not find dml stream");
				break;
			}
			
			bool parsed = false;
			if (dss->verify) {
				dk = dml_stream_crypto_get(ds);
			
				if (dml_packet_parse_data(data, len, &payload_data, &payload_len, &timestamp, dk)) {
					dml_log(DML_LOG_ERROR, "Decoding failed");
				} else {
					parsed = true;
				}
			} else {
				if (dml_packet_parse_data_unverified(data, len,
				    &payload_data, &payload_len, &timestamp)) {
				} else {
					parsed = true;
				}
			}
			if (parsed) {
				if (timestamp <= dml_stream_timestamp_get(ds)) {
					dml_log(DML_LOG_ERROR, "Timestamp mismatch %"PRIx64" <= %"PRIx64"",
					    timestamp, dml_stream_timestamp_get(ds));
				} else {
					dml_stream_timestamp_set(ds, timestamp);
//					dml_log(DML_LOG_DEBUG, "Received %zd ok", payload_len);
					dss->data_cb(dss->arg, payload_data, payload_len);
				
					g_source_remove_by_user_data(dss);
					g_timeout_add_seconds(DML_STREAM_CLIENT_SIMPLE_KEEPALIVE, keepalive_cb, dss);
				}
			}
			break;
		}
	}
	
	return;
}

static gboolean client_reconnect(void *arg)
{
	struct dml_stream_client_simple *dss = arg;

	if (dml_client_connect(dss->client)) {
		printf("Reconnect to DML server failed");
		g_timeout_add_seconds(DML_STREAM_CLIENT_SIMPLE_RECONNECT, client_reconnect, dss);
	} else {
		printf("Reconnect to DML server successfull");
		g_source_remove_by_user_data(dss);
		g_timeout_add_seconds(DML_STREAM_CLIENT_SIMPLE_KEEPALIVE, keepalive_cb, dss);
	}
	
	return G_SOURCE_REMOVE;
}

static int client_connection_close(struct dml_connection *dc, void *arg)
{
	struct dml_stream_client_simple *dss = arg;

	g_source_remove_by_user_data(dss);
	g_timeout_add_seconds(1, client_reconnect, dss);
	
	if (dc)
		dml_connection_destroy(dc);
	dss->dc = NULL;
	return 0;
}

static void client_connect(struct dml_client *client, void *arg)
{
	struct dml_stream_client_simple *dss = arg;
	struct dml_connection *dc;
	int fd;
	
	fd = dml_client_fd_get(client);
	
	dc = dml_connection_create(fd, arg, rx_packet, client_connection_close);
	if (dss->found_req_id) {
		dml_packet_send_hello(dc, DML_PACKET_HELLO_LEAF, "dml_stream_client " DML_VERSION);
		dml_packet_send_req_description(dc, dss->req_id);
	} else {
		dml_packet_send_hello(dc, DML_PACKET_HELLO_UPDATES, "dml_stream_client " DML_VERSION);	
	}

	dss->dc = dc;
}

struct dml_stream_client_simple *dml_stream_client_simple_create(
    char *server, uint8_t req_id[DML_ID_SIZE],
	void *arg,
    int (*data_cb)(void *arg, void *, size_t),
    bool verify)
{
	return dml_stream_client_simple_search_create(
	    server, req_id, NULL, NULL, NULL, arg, data_cb, verify);
}

struct dml_stream_client_simple *dml_stream_client_simple_search_create(
    char *server, uint8_t req_id[DML_ID_SIZE], char *name, char *alias, char *mime,
	void *arg,
    int (*data_cb)(void *arg, void *, size_t),
    bool verify)
{
	struct dml_stream_client_simple *dss;
	struct dml_client *client;
	
	dss = calloc(1, sizeof(struct dml_stream_client_simple));
	if (!dss)
		goto err_calloc;

	if (req_id) {
		memcpy(dss->req_id, req_id, DML_ID_SIZE);
		dss->found_req_id = true;
	} else {
		if (name)
			dss->name = strdup(name);
		if (alias)
			dss->alias = strdup(alias);
		if (mime)
			dss->mime = strdup(mime);
	}
	dss->data_cb = data_cb;
	dss->verify = verify;
	dss->arg = arg;  
	
	client = dml_client_create(server, 0, client_connect, dss);
	if (!client)
		goto err_create;
	dss->client = client;

	int r;
	do {
		r = dml_client_connect(client);
	
		if (r) {
			if (r != -2)
				goto err_connect;
			usleep(10000);
		}
	} while (r);

	g_timeout_add_seconds(DML_STREAM_CLIENT_SIMPLE_KEEPALIVE, keepalive_cb, dss);
	
	return dss;

err_connect:
	dml_client_destroy(client);
err_create:
	free(dss);
err_calloc:
	return NULL;
}

int dml_stream_client_simple_destroy(struct dml_stream_client_simple *dss)
{
	dml_connection_destroy(dss->dc);
	free(dss);

	return 0;
}

void dml_stream_client_simple_set_cb_mime(struct dml_stream_client_simple *dss,
	void *arg, void (*mime_cb)(void *arg, char *mime))
{
	dss->mime_cb_arg = arg;
	dss->mime_cb = mime_cb;
}

void dml_stream_client_simple_set_cb_header(struct dml_stream_client_simple *dss,
	void *arg, void (*header_cb)(void *arg, void *, size_t))
{
	dss->header_cb_arg = arg;
	dss->header_cb = header_cb;	
}

