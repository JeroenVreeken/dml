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
#include "dml_client.h"
#include "dml_connection.h"
#include "dml_poll.h"
#include "dml_packet.h"
#include "dml.h"
#include "dml_id.h"
#include "dml_crypto.h"
#include "dml_config.h"
#include "dml_stream.h"
#include "fprs_db.h"
#include "fprs_parse.h"

#include <eth_ar/eth_ar.h>

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <time.h>


#define DML_FPRS_DB_DATA_KEEPALIVE 10

#define TIME_VALID_UPLINK	(5*60)
#define TIME_VALID_DOWNLINK	(5*60*60)
#define DML_FPRS_DB_TIMER	(60)
#define DML_FPRS_REQ_TIMER	(5)

#define debug(...) printf(__VA_ARGS__)

static struct dml_stream *stream_fprs;
static struct dml_stream *stream_fprs_db;

struct dml_connection *dml_con;

struct dml_crypto_key *dk;

void recv_data(void *data, size_t size, uint64_t timestamp, struct dml_stream *from);

static uint16_t alloc_data_id(void)
{
	uint16_t id;
	
	for (id = DML_PACKET_DATA; id >= DML_PACKET_DATA; id++)
		if (!dml_stream_by_data_id(id))
			return id;
	return 0;
}

struct dml_stream_priv {
	bool mine;
	bool match_mime;
	bool connected;
	unsigned int link;
	time_t time_valid;
	
	uint8_t *header;
	size_t header_size;
};

struct dml_stream_priv *stream_priv_new(void)
{
	return calloc(1, sizeof(struct dml_stream_priv));
}

void stream_priv_free(struct dml_stream_priv *priv)
{
	free(priv);
}

static int connect(struct dml_stream *ds)
{
	uint16_t data_id = dml_stream_data_id_get(ds);
	if (!data_id)
		data_id = alloc_data_id();
	if (!data_id)
		return -1;

	printf("Connect to %p\n", ds);
	dml_stream_data_id_set(ds, data_id);
	dml_packet_send_connect(dml_con, dml_stream_id_get(ds), data_id);

	struct dml_stream_priv *priv = dml_stream_priv_get(ds);
	
	priv->connected = true;
	
	return 0;
}

void rx_packet(struct dml_connection *dc, void *arg, 
    uint16_t id, uint16_t len, uint8_t *data)
{
//	printf("got id: %d\n", id);
	
	switch(id) {
		case DML_PACKET_ROUTE: {
			uint8_t hops;
			uint8_t rid[DML_ID_SIZE];
			struct dml_stream *ds;
			
			if (dml_packet_parse_route(data, len, rid, &hops))
				break;
			
			if (hops == 255) {
				ds = dml_stream_by_id(rid);
				if (ds) {
					struct dml_stream_priv *priv = dml_stream_priv_get(ds);
					if (priv && priv->mine)
						break;
					stream_priv_free(dml_stream_priv_get(ds));
					dml_stream_remove(ds);
				}
			} else {
				ds = dml_stream_by_id_alloc(rid);
				if (!ds)
					break;
				struct dml_stream_priv *priv = dml_stream_priv_get(ds);
				if (!priv) {
					dml_stream_priv_set(ds, stream_priv_new());
				}
				char *mime = dml_stream_mime_get(ds);
				if (!mime)
					dml_packet_send_req_description(dc, rid);
				else if (priv->match_mime) {
					struct dml_crypto_key *ck = dml_stream_crypto_get(ds);
					if (!ck)
						dml_packet_send_req_certificate(dc, rid);
				}
			}
			
			break;
		}
		case DML_PACKET_DESCRIPTION: {
			struct dml_stream *ds;
			if (!(ds = dml_stream_update_description(data, len)))
				break;
			char *dmime = dml_stream_mime_get(ds);
			uint8_t *rid = dml_stream_id_get(ds);
			if (!strcmp(DML_MIME_FPRS, dmime)) {
				struct dml_stream_priv *priv = dml_stream_priv_get(ds);
				priv->match_mime = true;
				struct dml_crypto_key *ck = dml_stream_crypto_get(ds);
				if (!ck)
					dml_packet_send_req_certificate(dc, rid);
			}
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
				struct dml_stream_priv *priv = dml_stream_priv_get(ds);
				if (priv && priv->match_mime) {
					dml_crypto_cert_add_verify(cert, size, cid);
				}
			}
			free(cert);
			
			break;
		}
		case DML_PACKET_HEADER: {
			/* our fprs use doesn't need a header */
			
			break;
		}
		case DML_PACKET_REQ_DESCRIPTION: {
			uint8_t rid[DML_ID_SIZE];
			
			if (dml_packet_parse_req_description(data, len, rid))
				break;
			
			struct dml_stream *ds;
			if ((ds = dml_stream_by_id(rid))) {
				struct dml_stream_priv *priv = dml_stream_priv_get(ds);
				if (!priv)
					break;
				
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
		case DML_PACKET_CONNECT: {
			uint16_t connect_packet_id;
			uint8_t connect_id[DML_ID_SIZE];
			
			dml_packet_parse_connect(data, len, connect_id, &connect_packet_id);
			printf("Received connect, packet_id: %d\n", connect_packet_id);

			struct dml_stream *ds;
			if ((ds = dml_stream_by_id(connect_id))) {
				struct dml_stream_priv *priv = dml_stream_priv_get(ds);
				if (!priv)
					break;
				if (!priv->mine)
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
				struct dml_stream_priv *priv = dml_stream_priv_get(ds);
				if (!priv)
					break;
				if (!priv->mine)
					break;
				dml_stream_data_id_set(ds, 0);
				dml_packet_send_disc(dc, rid, DML_PACKET_DISC_REQUESTED);
				debug("Received disconnect\n");
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
		case DML_PACKET_REQ_HEADER: {
			uint8_t rid[DML_ID_SIZE];
			
			if (dml_packet_parse_req_header(data, len, rid))
				break;
			
			struct dml_stream *ds;
			if ((ds = dml_stream_by_id(rid))) {
				struct dml_stream_priv *priv = dml_stream_priv_get(ds);
				if (!priv)
					break;
			
				uint8_t header_sig[DML_SIG_SIZE];
			
				dml_crypto_sign(header_sig, priv->header, priv->header_size, dk);
			
				dml_packet_send_header(dc, rid, header_sig, priv->header, priv->header_size);
			}
			break;
		}
		case DML_PACKET_REQ_REVERSE: {
			uint8_t id_me[DML_ID_SIZE];
			uint8_t id_rev[DML_ID_SIZE];
			uint8_t action;
			
			if (dml_packet_parse_req_reverse(data, len, id_me, id_rev, &action))
				break;
			printf("Recevied reverse request %d\n", action);

			struct dml_stream *ds_rev = dml_stream_by_id(id_rev);
			struct dml_stream *ds_me = dml_stream_by_id(id_me);
			if (!ds_rev || !ds_me)
				break;
			if (action & DML_PACKET_REQ_REVERSE_CONNECT) {
				bool do_connect = true;

				struct dml_stream_priv *priv = dml_stream_priv_get(ds_rev);
		
				if (do_connect && priv) {
					struct dml_crypto_key *key = dml_stream_crypto_get(ds_rev);
					if (priv->match_mime && key) {
						connect(ds_rev);
						if (ds_me == stream_fprs) {
							printf("Connect request to backbone\n");
							priv->link = FPRS_PARSE_UPLINK;
							priv->time_valid = TIME_VALID_UPLINK;
						} else {
							printf("Connect request to DB\n");
							priv->link = FPRS_PARSE_DOWNLINK;
							priv->time_valid = TIME_VALID_DOWNLINK;
						}
					}
				}
			} else if (action & DML_PACKET_REQ_REVERSE_DISC) {
				struct dml_stream_priv *priv = dml_stream_priv_get(ds_rev);
				
				if (priv && priv->connected) {
					printf("Disconnect\n");
					dml_packet_send_req_disc(dml_con, id_rev);
					priv->connected = false;
				}
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
				fprintf(stderr, "Could not find dml stream\n");
				break;
			}
			struct dml_stream_priv *priv = dml_stream_priv_get(ds);
			
			if (!priv || !priv->connected) {
				fprintf(stderr, "Spurious data from %p\n", ds);
				break;
			}
			
			dk = dml_stream_crypto_get(ds);
			if (!dk) {
				fprintf(stderr, "Could not find key for stream %p id %d\n", ds, id);
				break;
			}

			if (dml_packet_parse_data(data, len,
			    &payload_data, &payload_len, &timestamp, dk)) {
				fprintf(stderr, "Decoding failed\n");
			} else {
				if (timestamp <= dml_stream_timestamp_get(ds)) {
					fprintf(stderr, "Timestamp mismatch %"PRIx64" <= %"PRIx64"\n",
					    timestamp, dml_stream_timestamp_get(ds));
				} else {
					dml_stream_timestamp_set(ds, timestamp);
					fprintf(stderr, "Received %zd ok\n", payload_len);
					recv_data(payload_data, payload_len, timestamp, ds);
				}
			}
			break;
		}
	}
	
	return;
}

int client_reconnect(void *clientv)
{
	struct dml_client *client = clientv;

	if (dml_client_connect(client)) {
		printf("Reconnect to DML server failed\n");
		dml_poll_timeout(client, &(struct timespec){ 2, 0 });
	}
	
	return 0;
}

int client_connection_close(struct dml_connection *dc, void *arg)
{
	dml_con = NULL;

	struct dml_stream *ds = NULL;
	while ((ds = dml_stream_iterate(ds))) {
		struct dml_stream_priv *priv = dml_stream_priv_get(ds);
		if (!priv)
			continue;
		if (!priv->mine)
			continue;
		dml_stream_data_id_set(ds, 0);
	}

	dml_poll_add(arg, NULL, NULL, client_reconnect);
	dml_poll_timeout(arg, &(struct timespec){ 1, 0 });
	
	if (dc)
		return dml_connection_destroy(dc);
	else
		return 0;
}

void client_connect(struct dml_client *client, void *arg)
{
	struct dml_connection *dc;
	int fd;
	
	printf("Connected to DML server\n");
	
	fd = dml_client_fd_get(client);
	
	dc = dml_connection_create(fd, client, rx_packet, client_connection_close);
	dml_con = dc;
	dml_packet_send_hello(dc, 
	    DML_PACKET_HELLO_LEAF | DML_PACKET_HELLO_UPDATES,
	    "dml_fprs_db " DML_VERSION);

	struct dml_stream *ds = NULL;
	while ((ds = dml_stream_iterate(ds))) {
		struct dml_stream_priv *priv = dml_stream_priv_get(ds);
		if (!priv)
			continue;
		if (!priv->mine)
			continue;
		dml_packet_send_route(dc, dml_stream_id_get(ds), 0);
	}
}


static int send_data(void *data, size_t size, unsigned int link, void *arg)
{
	uint64_t timestamp;
	struct timespec ts;
	uint16_t packet_id;
	
	clock_gettime(CLOCK_REALTIME, &ts);
	timestamp = dml_ts2timestamp(&ts);
	
	if (link & FPRS_PARSE_UPLINK) {
printf("send to uplink\n");
		packet_id = dml_stream_data_id_get(stream_fprs);
		if (packet_id)
			dml_packet_send_data(dml_con, packet_id, data, size, timestamp, dk);
	}
	if (link & FPRS_PARSE_DOWNLINK) {
printf("send to downlink\n");
		packet_id = dml_stream_data_id_get(stream_fprs_db);
		if (packet_id)
			dml_packet_send_data(dml_con, packet_id, data, size, timestamp, dk);
	}
	return 0;
}


void recv_data(void *data, size_t size, uint64_t timestamp, struct dml_stream *from)
{
	struct timespec ts;
	struct dml_stream_priv *priv = dml_stream_priv_get(from);
	
	dml_timestamp2ts(&ts, timestamp);
	
	fprs_parse_data(data, size, &ts,
	    priv->link,
	    priv->time_valid,
	    send_data,
	    NULL
	    );
}


static int fprs_timer(void *arg)
{
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);

	debug("fprs_timer elapsed\n");
	
	fprs_db_flush(ts.tv_sec);

	if (dml_con) {
		struct dml_stream *ds = NULL;
		while ((ds = dml_stream_iterate(ds))) {
			struct dml_stream_priv *priv = dml_stream_priv_get(ds);
			if (!priv)
				continue;
			if (priv->mine)
				continue;
			if (!strcmp(dml_stream_alias_get(ds), DML_ALIAS_FPRS_BACKBONE)) {
				connect(ds);
			}

		}
	}

	dml_poll_timeout(&fprs_timer, 
	    &(struct timespec){ DML_FPRS_DB_TIMER, 0});
	    
	return 0;
}

static int fprs_req_timer(void *arg)
{
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);

	fprs_parse_request_flush(send_data, NULL);

	dml_poll_timeout(&fprs_timer, 
	    &(struct timespec){ DML_FPRS_REQ_TIMER, 0});
	    
	return 0;
}

int main(int argc, char **argv)
{
	struct dml_client *dc;
	char *file = "dml_fprs_db.conf";
	char *certificate;
	char *key;
	char *server;
	char *ca;
	uint8_t id[DML_ID_SIZE];
	char *name;
	char *description;
	uint32_t bps = 6400;


	if (argc > 1)
		file = argv[1];

	if (dml_config_load(file)) {
		printf("Failed to load config file %s\n", file);
		return -1;
	}
	name = dml_config_value("name", NULL, "test_db");
	description = dml_config_value("description", NULL, "Test database");

	server = dml_config_value("server", NULL, "localhost");
	certificate = dml_config_value("certificate", NULL, "");
	key = dml_config_value("key", NULL, "");

	ca = dml_config_value("ca", NULL, ".");
	
	if (dml_crypto_init(NULL, ca)) {
		fprintf(stderr, "Failed to init crypto\n");
		return -1;
	}

	if (dml_crypto_load_cert(certificate)) {
		printf("Could not load certificate\n");
		return -1;
	}
	
	if (!(dk = dml_crypto_private_load(key))) {
		printf("Could not load key\n");
		return -1;
	}
	
	if (dml_id_gen(id, DML_PACKET_DESCRIPTION_VERSION_0, bps, 
	    DML_MIME_FPRS, name, DML_ALIAS_FPRS_BACKBONE, description))
		return -1;
	struct dml_stream_priv *priv_fprs;
	
	stream_fprs = dml_stream_by_id_alloc(id);
	priv_fprs = stream_priv_new();
	priv_fprs->mine = true;
	dml_stream_priv_set(stream_fprs, priv_fprs);
    	dml_stream_name_set(stream_fprs, name);
	dml_stream_alias_set(stream_fprs, DML_ALIAS_FPRS_BACKBONE);
	dml_stream_mime_set(stream_fprs, DML_MIME_FPRS);
	dml_stream_description_set(stream_fprs, description);
	dml_stream_bps_set(stream_fprs, bps);

	if (dml_id_gen(id, DML_PACKET_DESCRIPTION_VERSION_0, bps, 
	    DML_MIME_FPRS, name, DML_ALIAS_FPRS_DB, description))
		return -1;
	struct dml_stream_priv *priv_fprs_db;
	
	stream_fprs_db = dml_stream_by_id_alloc(id);
	priv_fprs_db = stream_priv_new();
	priv_fprs_db->mine = true;
	dml_stream_priv_set(stream_fprs_db, priv_fprs_db);
    	dml_stream_name_set(stream_fprs_db, name);
	dml_stream_alias_set(stream_fprs_db, DML_ALIAS_FPRS_DB);
	dml_stream_mime_set(stream_fprs_db, DML_MIME_FPRS);
	dml_stream_description_set(stream_fprs_db, description);
	dml_stream_bps_set(stream_fprs_db, bps);

	dc = dml_client_create(server, 0, client_connect, NULL);

	if (dml_client_connect(dc)) {
		printf("Could not connect to server\n");
		return -1;
	}

	dml_poll_add(&fprs_timer, NULL, NULL, fprs_timer);
	dml_poll_add(&fprs_req_timer, NULL, NULL, fprs_req_timer);

	dml_poll_timeout(&fprs_timer, 
	    &(struct timespec){ DML_FPRS_DB_TIMER, 0});
	dml_poll_timeout(&fprs_req_timer, 
	    &(struct timespec){ DML_FPRS_REQ_TIMER, 0});

	dml_poll_loop();

	return 0;
}
