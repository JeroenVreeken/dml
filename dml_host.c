/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2017

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

#include <dml/dml_host.h>

#include <dml/dml_client.h>
#include <dml/dml_connection.h>
#include <dml/dml_crypto.h>
#include <dml/dml_packet.h>
#include <dml/dml_log.h>

#include <dml_config.h>

#include <string.h>
#include <stdio.h>

struct dml_host {
	struct dml_client *client;
	struct dml_connection *connection;
	
	char **mime_filter;
	int mime_filter_nr;

	void (*connection_closed_cb)(struct dml_host *host, void *arg);
	void *connection_closed_cb_arg;

	void (*update_cb)(struct dml_host *host, uint32_t flags, void *arg);
	void *update_cb_arg;

	void (*stream_added_cb)(struct dml_host *host, struct dml_stream *ds, void *arg);
	void *stream_added_cb_arg;
	
	void (*stream_removed_cb)(struct dml_host *host, struct dml_stream *ds, void *arg);
	void *stream_removed_cb_arg;
	
	void (*stream_header_cb)(struct dml_host *host, struct dml_stream *ds, void *header, size_t header_size, void *arg);
	void *stream_header_cb_arg;

	void (*stream_data_cb)(struct dml_host *host, struct dml_stream *ds, uint64_t timestamp, void *data, size_t data_size, void *arg);
	void *stream_data_cb_arg;

	void (*stream_req_reverse_connect_cb)(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg);
	void *stream_req_reverse_connect_cb_arg;

	void (*stream_req_reverse_disconnect_cb)(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg);
	void *stream_req_reverse_disconnect_cb_arg;
};

bool dml_host_mime_filter(struct dml_host *host, struct dml_stream *ds)
{
	char *dmime = dml_stream_mime_get(ds);
	int i;

	/* exception: no filter, pass all */
	if (!host->mime_filter_nr)
		return true;

	for (i = 0; i < host->mime_filter_nr; i++) {
		if (!strcmp(host->mime_filter[i], dmime)) {
			return true;
		}
	}
	return false;
}

static void rx_packet(struct dml_connection *dc, void *arg, 
    uint16_t id, uint16_t len, uint8_t *data)
{
	struct dml_host *host = arg;

	switch(id) {
		case DML_PACKET_UPDATE: {
			uint32_t flags;
			
			if (dml_packet_parse_update(data, len, &flags))
				break;
		
			if (host->update_cb)
				host->update_cb(host, flags, host->update_cb_arg);
		
			break;
		}
		case DML_PACKET_ROUTE: {
			uint8_t hops;
			uint8_t rid[DML_ID_SIZE];
			struct dml_stream *ds;
			
			if (dml_packet_parse_route(data, len, rid, &hops))
				break;
			
			if (hops == 255) {
				ds = dml_stream_by_id(rid);
				if (ds) {
					if (dml_stream_mine_get(ds))
						break;
					
					if (host->stream_removed_cb)
						host->stream_removed_cb(host, ds, host->stream_removed_cb_arg);
					dml_stream_remove(ds);
				}
			} else {
				ds = dml_stream_by_id_alloc(rid);
				if (!ds)
					break;
				dml_stream_hops_set(ds, hops);
				char *mime = dml_stream_mime_get(ds);
				if (!mime)
					dml_packet_send_req_description(dc, rid);
				else if (dml_host_mime_filter(host, ds)) {
					struct dml_crypto_key *ck = dml_stream_crypto_get(ds);
					if (!ck)
						dml_packet_send_req_certificate(dc, rid);
				}
			}
			
			break;
		}

		case DML_PACKET_REQ_DESCRIPTION: {
			uint8_t rid[DML_ID_SIZE];
			
			if (dml_packet_parse_req_description(data, len, rid))
				break;
			
			struct dml_stream *ds;
			if ((ds = dml_stream_by_id(rid))) {
				dml_packet_send_description(dc, rid,
				    DML_PACKET_DESCRIPTION_VERSION_0, 
				    dml_stream_bps_get(ds), 
				    dml_stream_mime_get(ds), 
				    dml_stream_name_get(ds), 
				    dml_stream_alias_get(ds), 
				    dml_stream_description_get(ds));
			}
			break;
		}
		case DML_PACKET_DESCRIPTION: {
			bool new_stream = false;
			struct dml_stream *ds;
			if (!(ds = dml_stream_update_description(data, len, &new_stream)))
				break;
			uint8_t *rid = dml_stream_id_get(ds);

			if (dml_host_mime_filter(host, ds)) {
				struct dml_crypto_key *ck = dml_stream_crypto_get(ds);
				if (!ck)
					dml_packet_send_req_certificate(dc, rid);
		
				if (new_stream && host->stream_added_cb)
					host->stream_added_cb(host, ds, host->stream_added_cb_arg);	
			}
			
			break;
		}

		case DML_PACKET_REQ_CERTIFICATE: {
			void *cert;
			size_t cert_size;
			uint8_t rid[DML_ID_SIZE];
			
			if (dml_packet_parse_req_certificate(data, len, rid))
				break;
			
			if (dml_crypto_cert_get(&cert, &cert_size))
				break;
			
			dml_packet_send_certificate(dc, rid, cert, cert_size);
			break;
		}
		case DML_PACKET_CERTIFICATE: {
			uint8_t cid[DML_ID_SIZE];
			void *cert;
			size_t size;
			struct dml_stream *ds;
			
			if (dml_packet_parse_certificate(data, len, cid, &cert, &size))
				break;
			if ((ds = dml_stream_by_id(cid))) {
				if (dml_host_mime_filter(host, ds)) {
					if (dml_crypto_cert_add_verify(cert, size, cid)) {
						dml_log(DML_LOG_INFO, "Not accepting certificate for %s", dml_stream_name_get(ds));
					}
				}
			}
			free(cert);
			
			break;
		}

		case DML_PACKET_REQ_HEADER: {
			uint8_t rid[DML_ID_SIZE];
			
			if (dml_packet_parse_req_header(data, len, rid))
				break;
			
			struct dml_stream *ds;
			if ((ds = dml_stream_by_id(rid))) {
				uint8_t header_sig[DML_SIG_SIZE];
				uint8_t *header;
				size_t header_size;
				struct dml_crypto_key *dk = dml_stream_crypto_get(ds);
				
				dml_stream_header_get(ds, &header, &header_size);
			
				dml_crypto_sign(header_sig, header, header_size, dk);
			
				dml_packet_send_header(dc, rid, header_sig, header, header_size);
				dml_log(DML_LOG_INFO, "Header requested");
			}
			break;
		}
		case DML_PACKET_HEADER: {
			uint8_t hid[DML_ID_SIZE];
			uint8_t sig[DML_SIG_SIZE];
			void *header;
			size_t header_size;
			struct dml_stream *ds;
			struct dml_crypto_key *dk;

			if (dml_packet_parse_header(data, len, hid, sig, &header, &header_size))
				break;
			
			if ((ds = dml_stream_by_id(hid))) {
				if ((dk = dml_stream_crypto_get(ds))) {
					bool verified = dml_crypto_verify(header, header_size, sig, dk);
			
					if (verified) {
						if (host->stream_header_cb)
							host->stream_header_cb(host, ds, header, header_size, host->stream_header_cb_arg);
					} else {
						dml_log(DML_LOG_ERROR, "Failed to verify header signature (%zd bytes)", header_size);
					}
				}
			}
			free(header);
			
			break;
		}

		case DML_PACKET_CONNECT: {
			uint16_t connect_packet_id;
			uint8_t connect_id[DML_ID_SIZE];
			
			dml_packet_parse_connect(data, len, connect_id, &connect_packet_id);
			dml_log(DML_LOG_INFO, "Received connect, packet_id: %d", connect_packet_id);
			
			struct dml_stream *ds;
			if ((ds = dml_stream_by_id(connect_id))) {
				if (!dml_stream_mine_get(ds))
					break;
				dml_stream_data_id_set(ds, connect_packet_id);
			}	
			
			break;
		}
		case DML_PACKET_REQ_DISC: {
			uint8_t rid[DML_ID_SIZE];
			
			if (dml_packet_parse_req_disc(data, len, rid))
				break;
			
			struct dml_stream *ds;
			if ((ds = dml_stream_by_id(rid))) {
				if (!dml_stream_mine_get(ds))
					break;
				dml_stream_data_id_set(ds, 0);
				dml_packet_send_disc(dc, rid, DML_PACKET_DISC_REQUESTED);
			}
			break;
		}

		case DML_PACKET_REQ_REVERSE: {
			uint8_t id_me[DML_ID_SIZE];
			uint8_t id_rev[DML_ID_SIZE];
			uint8_t action;
			uint16_t status;
			
			if (dml_packet_parse_req_reverse(data, len, id_me, id_rev, &action, &status))
				break;
			dml_log(DML_LOG_INFO, "Received reverse request: %d status: %d", action, status);

			struct dml_stream *ds_rev = dml_stream_by_id(id_rev);
			struct dml_stream *ds = dml_stream_by_id(id_me);
			if (!ds_rev || !ds)
				break;
			if (action & DML_PACKET_REQ_REVERSE_CONNECT) {
				if (host->stream_req_reverse_connect_cb)
					host->stream_req_reverse_connect_cb(host, ds, ds_rev, status, host->stream_req_reverse_connect_cb_arg);
			} else if (action & DML_PACKET_REQ_REVERSE_DISC) {
				if (host->stream_req_reverse_disconnect_cb)
					host->stream_req_reverse_disconnect_cb(host, ds, ds_rev, status, host->stream_req_reverse_disconnect_cb_arg);
			}
			
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
			dk = dml_stream_crypto_get(ds);
			if (!dk) {
				dml_log(DML_LOG_ERROR, "Could not find key for stream %s id %d", dml_stream_name_get(ds), id);
				break;
			}

			if (dml_packet_parse_data(data, len,
			    &payload_data, &payload_len, &timestamp, dk)) {
				dml_log(DML_LOG_ERROR, "Decoding failed");
			} else {
				if (timestamp <= dml_stream_timestamp_get(ds)) {
					dml_log(DML_LOG_ERROR, "Timestamp mismatch %"PRIx64" <= %"PRIx64"",
					    timestamp, dml_stream_timestamp_get(ds));
				} else {
					dml_stream_timestamp_set(ds, timestamp);
					
					if (host->stream_data_cb)
						host->stream_data_cb(host, ds, timestamp, payload_data, payload_len, host->stream_data_cb_arg);
				}
			}
			break;
		}

	}
}

static uint16_t alloc_data_id(void)
{
	uint16_t id;
	
	for (id = DML_PACKET_DATA; id >= DML_PACKET_DATA; id++)
		if (!dml_stream_by_data_id(id))
			return id;
	return 0;
}

int dml_host_connect(struct dml_host *host, struct dml_stream *ds)
{
	if (!host->connection)
		return -1;
	
	uint16_t data_id = dml_stream_data_id_get(ds);
	if (!data_id) {
		data_id = alloc_data_id();
		if (!data_id)
			return -1;
	}

	dml_log(DML_LOG_INFO, "Connect to %s (data id %d)", dml_stream_name_get(ds), data_id);
	dml_stream_data_id_set(ds, data_id);
	dml_packet_send_connect(host->connection, dml_stream_id_get(ds), data_id);

	return 0;
}

static gboolean client_reconnect(void *arg)
{
	struct dml_host *host = arg;

	if (dml_client_connect(host->client)) {
		dml_log(DML_LOG_INFO, "Reconnect to DML server failed");
		g_timeout_add_seconds(2, client_reconnect, host);
	}
	
	return G_SOURCE_REMOVE;
}


static int client_connection_close(struct dml_connection *dc, void *arg)
{
	struct dml_host *host = arg;
	host->connection = NULL;

	struct dml_stream *ds = NULL;
	while ((ds = dml_stream_iterate(ds))) {
		if (!dml_stream_mine_get(ds))
			continue;
		dml_stream_data_id_set(ds, 0);
	}
	
	if (host->connection_closed_cb)
		host->connection_closed_cb(host, host->connection_closed_cb_arg);

	g_timeout_add_seconds(1, client_reconnect, host);
	
	if (dc) {
		return dml_connection_destroy(dc);
	} else
		return 0;
}


static void client_connect(struct dml_client *client, void *arg)
{
	struct dml_host *host = arg;
	struct dml_connection *dc;
	int fd;
	
	dml_log(DML_LOG_INFO, "Connected to DML server");
	
	fd = dml_client_fd_get(client);
	
	dc = dml_connection_create(fd, host, rx_packet, client_connection_close);
	host->connection = dc;
	dml_packet_send_hello(dc, 
	    DML_PACKET_HELLO_LEAF | DML_PACKET_HELLO_UPDATES,
	    "dml_host " DML_VERSION);
	
	struct dml_stream *ds = NULL;
	while ((ds = dml_stream_iterate(ds))) {
		if (!dml_stream_mine_get(ds))
			continue;
		dml_packet_send_route(dc, dml_stream_id_get(ds), 0);
	}
}

struct dml_connection *dml_host_connection_get(struct dml_host *host)
{
	return host->connection;
}


int dml_host_mime_filter_set(struct dml_host *host, int nr, char **mimetypes)
{
	host->mime_filter = mimetypes;
	host->mime_filter_nr = nr;
	
	return 0;
}

int dml_host_update_cb_set(struct dml_host *host,
    void(*cb)(struct dml_host *host, uint32_t flags, void *arg), void *arg)
{
	host->update_cb = cb;
	host->update_cb_arg = arg;
	
	return 0;
}

int dml_host_stream_added_cb_set(struct dml_host *host, 
    void(*cb)(struct dml_host *host, struct dml_stream *ds, void *arg), void *arg)
{
	host->stream_added_cb = cb;
	host->stream_added_cb_arg = arg;
	
	return 0;
}

int dml_host_stream_removed_cb_set(struct dml_host *host, 
    void(*cb)(struct dml_host *host, struct dml_stream *ds, void *arg), void *arg)
{
	host->stream_removed_cb = cb;
	host->stream_removed_cb_arg = arg;
	
	return 0;
}

int dml_host_stream_header_cb_set(struct dml_host *host, 
	void (*cb)(struct dml_host *host, struct dml_stream *ds, void *header, size_t header_size, void *arg), void *arg)
{
	host->stream_header_cb = cb;
	host->stream_header_cb_arg = arg;
	
	return 0;
}

int dml_host_stream_data_cb_set(struct dml_host *host, 
	void (*cb)(struct dml_host *host, struct dml_stream *ds, uint64_t timestamp, void *data, size_t data_size, void *arg), void *arg)
{
	host->stream_data_cb = cb;
	host->stream_data_cb_arg = arg;
	
	return 0;
}

int dml_host_stream_req_reverse_connect_cb_set(struct dml_host *host,
    void (*cb)(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg), void *arg)
{
	host->stream_req_reverse_connect_cb = cb;
	host->stream_req_reverse_connect_cb_arg = arg;
	
	return 0;
}

int dml_host_stream_req_reverse_disconnect_cb_set(struct dml_host *host,
    void (*cb)(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg), void *arg)
{
	host->stream_req_reverse_disconnect_cb = cb;
	host->stream_req_reverse_disconnect_cb_arg = arg;
	
	return 0;
}

int dml_host_connection_closed_cb_set(struct dml_host *host, 
    void(*cb)(struct dml_host *host, void *arg), void *arg)
{
	host->connection_closed_cb = cb;
	host->connection_closed_cb_arg = arg;
	
	return 0;
}

struct dml_host *dml_host_create(char *config_file)
{
	struct dml_host *host = calloc(1, sizeof(struct dml_host));

	if (!host)
		goto err_alloc;
	
	if (dml_config_load(config_file)) {
		if (config_file) {
			dml_log(DML_LOG_ERROR, "Failed to load config file %s", config_file);
			goto err_config;
		}
	}

	char *server = dml_config_value("server", NULL, "localhost");
	char *ca = dml_config_value("ca", NULL, dml_config_path());
	
	if (dml_crypto_init(NULL, ca)) {
		dml_log(DML_LOG_ERROR, "Failed to init crypto, ca=%s", ca);
		goto err_crypto;
	}

	host->client = dml_client_create(server, 0, client_connect, host);

	int r;
	if ((r = dml_client_connect(host->client))) {
		if (r == -2) {
			/* Address resolution ongoing... trye again a bit faster */
			dml_log(DML_LOG_DEBUG, "Continue connect to %s later", server);
			g_timeout_add(100, client_reconnect, host);
		} else {
			dml_log(DML_LOG_ERROR, "Failed to connect to %s, try again later", server);
			g_timeout_add_seconds(2, client_reconnect, host);
		}
	}

	return host;
err_crypto:
err_config:
	free(host);
err_alloc:
	return NULL;
}

