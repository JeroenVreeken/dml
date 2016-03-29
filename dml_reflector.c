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
#include "dml_client.h"
#include "dml_connection.h"
#include "dml_poll.h"
#include "dml_packet.h"
#include "dml.h"
#include "dml_id.h"
#include "dml_crypto.h"
#include "dml_config.h"
#include "dml_stream.h"

#include "eth_ar.h"
#include "alaw.h"

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <time.h>



uint8_t ref_id[DML_ID_SIZE];
char *mime = "audio/dml-codec2";
char *name;
char *alias;
char *description;
uint32_t bps = 6400;

uint16_t packet_id = 0;
struct dml_connection *dml_con;

uint8_t *header = &(uint8_t){ 0 };
size_t header_size = 0;

struct dml_crypto_key *dk;

void recv_data(void *data, size_t size, uint64_t timestamp);
void send_beep(void);

static uint16_t alloc_data_id(void)
{
	uint16_t id;
	
	for (id = DML_PACKET_DATA; id >= DML_PACKET_DATA; id++)
		if (!dml_stream_by_data_id(id))
			return id;
	return 0;
}

struct dml_stream_priv {
	bool match_mime;
	bool connected;
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
	uint16_t data_id = alloc_data_id();
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
			if (!strcmp(mime, dmime)) {
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
			/* our current codec2 use doesn't need a header */
			
			break;
		}
		case DML_PACKET_REQ_DESCRIPTION: {
			/* No need to unpack the request,
			   we only have one stream...*/
			dml_packet_send_description(dc, ref_id,
			    DML_PACKET_DESCRIPTION_VERSION_0, bps, mime, 
			    name, alias, description);
			break;
		}
		case DML_PACKET_CONNECT: {
			uint8_t cid[DML_ID_SIZE];
			
			dml_packet_parse_connect(data, len, cid, &packet_id);
			break;
		}
		case DML_PACKET_REQ_DISC: {
			packet_id = 0;
			dml_packet_send_disc(dc, ref_id, DML_PACKET_DISC_REQUESTED);
			break;
		}
		case DML_PACKET_REQ_CERTIFICATE: {
			void *cert;
			size_t cert_size;
			
			if (dml_crypto_cert_get(&cert, &cert_size))
				break;
			
			dml_packet_send_certificate(dc, ref_id, cert, cert_size);
			break;
		}
		case DML_PACKET_REQ_HEADER: {
			uint8_t header_sig[DML_SIG_SIZE];
			
			dml_crypto_sign(header_sig, header, header_size, dk);
			
			dml_packet_send_header(dc, ref_id, header_sig, header, header_size);
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
			if (!ds_rev)
				break;
			if (action & DML_PACKET_REQ_REVERSE_CONNECT) {
				bool do_connect = true;

				struct dml_stream_priv *priv = dml_stream_priv_get(ds_rev);
		
				if (do_connect && priv) {
					struct dml_crypto_key *key = dml_stream_crypto_get(ds_rev);
					if (priv->match_mime && key) {
						connect(ds_rev);
						send_beep();
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
			
			if (dml_packet_parse_data(data, len,
			    &payload_data, &payload_len, &timestamp, dk)) {
				fprintf(stderr, "Decoding failed\n");
			} else {
				if (timestamp <= dml_stream_timestamp_get(ds)) {
					fprintf(stderr, "Timestamp mismatch %"PRIx64" <= %"PRIx64"\n",
					    timestamp, dml_stream_timestamp_get(ds));
				} else {
					dml_stream_timestamp_set(ds, timestamp);
//					fprintf(stderr, "Received %zd ok\n", payload_len);
					recv_data(payload_data, payload_len, timestamp);
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
	packet_id = 0;

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
	    "dml_reflector " DML_VERSION);
	dml_packet_send_route(dc, ref_id, 0);
}

uint64_t prev_timestamp = 0;

void send_data(void *data, size_t size, uint64_t timestamp)
{
	struct timespec ts;
	uint64_t tmax;
		
	if (!packet_id)
		return;
	
	if (timestamp <= prev_timestamp)
		return;

	if (timestamp <= prev_timestamp) {
		fprintf(stderr, "Dropping packet %"PRId64"\n", timestamp);
		return;
	}


	clock_gettime(CLOCK_REALTIME, &ts);
	tmax = (ts.tv_sec + 2) << 16;
	if (timestamp > tmax)
		return;
	
	prev_timestamp = timestamp;

	dml_packet_send_data(dml_con, packet_id, data, size, timestamp, dk);
}


static bool tx_state = false;

void recv_data(void *data, size_t size, uint64_t timestamp)
{
	if (size < 8)
		return;
	
	uint8_t *datab = data;
	
//	int mode = datab[6];
	bool state = datab[7] & 0x1;
	
//	printf("mode %d state %d\n", mode, state);
	
	if (state != tx_state) {
		char call[ETH_AR_CALL_SIZE];
		int ssid;
		bool multicast;
		
		eth_ar_mac2call(call, &ssid, &multicast, data);
		tx_state = state;
		printf("State changed to %s by %s-%d\n", state ? "ON":"OFF", call, ssid);
	}
	
	send_data(data, size, timestamp);
}


int beepsize;
uint8_t *beep;

void send_beep(void)
{
	uint8_t data[beepsize + 8];
	struct timespec ts;
	uint64_t timestamp;

	memset(data, 0xff, 6);
	data[6] = 'A';
	data[7] = 1;
	memcpy(data + 8, beep, beepsize);

	clock_gettime(CLOCK_REALTIME, &ts);
	timestamp = (ts.tv_sec + 2) << 16;
	if (timestamp <= prev_timestamp)
		timestamp = prev_timestamp + 1;;
	
	send_data(data, beepsize + 8, timestamp);
}


int main(int argc, char **argv)
{
	struct dml_client *dc;
	char *file = "dml_reflector.conf";
	char *certificate;
	char *key;
	char *server;
	char *ca;

	if (argc > 1)
		file = argv[1];

	if (dml_config_load(file)) {
		printf("Failed to load config file %s\n", file);
		return -1;
	}
	name = dml_config_value("name", NULL, "test_reflector");
	alias = dml_config_value("alias", NULL, "0000");
	description = dml_config_value("description", NULL, "Test reflector");

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
	
	if (dml_id_gen(ref_id, DML_PACKET_DESCRIPTION_VERSION_0, bps, 
	    mime, name, alias, description))
		return -1;
    	
	dc = dml_client_create(server, 0, client_connect, NULL);		

	if (dml_client_connect(dc)) {
		printf("Could not connect to server\n");
		return -1;
	}

	beep = alaw_beep(400, 8000, 0.08);
	if (!beep) {
		printf("Could not generate beep\n");
	}
	beepsize = 8000 * 0.08;

	dml_poll_loop();

	return 0;
}
