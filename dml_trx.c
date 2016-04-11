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

#include "trx_dv.h"
#include "alaw.h"
#include "eth_ar.h"

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
bool fullduplex = false;

uint16_t packet_id = 0;
struct dml_connection *dml_con;

uint8_t *header = &(uint8_t){ 0 };
size_t header_size = 0;

struct dml_crypto_key *dk;

static struct dml_stream *cur_con = NULL;
static uint16_t cur_id = 0;
static struct dml_crypto_key *cur_dk = NULL;

void recv_data(void *data, size_t size);
void send_beep800(void);
void send_beep1600(void);


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

	cur_con = ds;
	cur_id = data_id;
	cur_dk = dml_stream_crypto_get(ds);
	
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
					if (ds == cur_con) {
						cur_con = NULL;
						cur_id = 0;
					}
					stream_priv_free(dml_stream_priv_get(ds));
					dml_stream_remove(ds);
				}
			} else {
				ds = dml_stream_by_id_alloc(rid);
				if (!ds)
					break;
				struct dml_stream_priv *priv = dml_stream_priv_get(ds);
				if (!priv) {
					priv = stream_priv_new();
					dml_stream_priv_set(ds, priv);
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
				if (!priv) {
					priv = stream_priv_new();
					dml_stream_priv_set(ds, priv);
				}
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
			printf("Received connect, packet_id: %d\n", packet_id);
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
				bool do_reject = false;
				bool do_connect = true;
				if (cur_con) {
					if (cur_con != ds_rev) {
						do_reject = true;
					}
					do_connect = false;
					break;
				}
				struct dml_stream_priv *priv = dml_stream_priv_get(ds_rev);
		
				if (do_connect && priv) {
					struct dml_crypto_key *key = dml_stream_crypto_get(ds_rev);
					if (priv->match_mime && key) {
						printf("Request accepted, connecting\n");
						connect(ds_rev);
					}
				}
				if (do_reject) {
					printf("Request rejected\n");
					dml_packet_send_req_reverse(dml_con,
					    id_rev, 
					    ref_id,
					    DML_PACKET_REQ_REVERSE_DISC);
				}
			} else if (action & DML_PACKET_REQ_REVERSE_DISC) {
				if (ds_rev == cur_con) {
					printf("Disconnect\n");
					dml_packet_send_req_disc(dml_con, id_rev);
					cur_con = NULL;
					cur_id = 0;
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
			
			if (id != cur_id) {
				fprintf(stderr, "Spurious data from %d\n", id);
				break;
			}
						
			if (dml_packet_parse_data(data, len,
			    &payload_data, &payload_len, &timestamp, cur_dk)) {
				fprintf(stderr, "Decoding failed\n");
			} else {
				if (timestamp <= dml_stream_timestamp_get(cur_con)) {
					fprintf(stderr, "Timestamp mismatch %"PRIx64" <= %"PRIx64"\n",
					    timestamp, dml_stream_timestamp_get(cur_con));
				} else {
					dml_stream_timestamp_set(cur_con, timestamp);
//					fprintf(stderr, "Received %zd ok\n", payload_len);
					recv_data(payload_data, payload_len);
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
	    "dml_trx " DML_VERSION);
	dml_packet_send_route(dc, ref_id, 0);
}

time_t prev_sec;
uint16_t prev_ctr;

void send_data(void *data, size_t size)
{
	uint64_t timestamp;
	struct timespec ts;
	
	if (!packet_id)
		return;
	
	clock_gettime(CLOCK_REALTIME, &ts);
	if (prev_sec != ts.tv_sec) {
		prev_ctr = 0;
		prev_sec = ts.tv_sec;
	} else {
		prev_ctr++;
	}
	timestamp = ts.tv_sec << 16;
	timestamp |= prev_ctr;
	
	dml_packet_send_data(dml_con, packet_id, data, size, timestamp, dk);
}


static bool rx_state = false;
static bool tx_state = false;

uint8_t mac_last[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
uint8_t mac_bcast[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };

void recv_data(void *data, size_t size)
{
	if (size < 8)
		return;
	
	uint8_t *datab = data;
	
	uint8_t mode = datab[6];
	bool state = datab[7] & 0x1;
	
//	printf("mode %d state %d\n", mode, state);
	
	if (!rx_state || fullduplex) {
		if (state != tx_state) {
			char call[ETH_AR_CALL_SIZE];
			int ssid;
			bool multicast;
		
			eth_ar_mac2call(call, &ssid, &multicast, data);
			tx_state = state;
			printf("State changed to %s by %s-%d\n", state ? "ON":"OFF", multicast ? "MULTICAST" : call, ssid);
		}
	
		if (size > 8) {
			trx_dv_send(data, mac_bcast, mode, datab + 8, size - 8);
		}
	}
}

int beepsize;
uint8_t *beep800, *beep1600;
bool do_beep800, do_beep1600;

void send_beep800(void)
{
	trx_dv_send(mac_bcast, mac_bcast, 'A', beep800, beepsize);
}
void send_beep1600(void)
{
	trx_dv_send(mac_bcast, mac_bcast, 'A', beep1600, beepsize);
}

int rx_watchdog(void *arg)
{
	if (rx_state) {
		printf("No activity, sending state off packet\n");
		rx_state = false;
	
		uint8_t data[8];

		memcpy(data, mac_last, 6);
		data[6] = 0;
		data[7] = rx_state;

		send_data(data, 8);
		
		if (do_beep800) {
			send_beep800();
			do_beep800 = false;
		}
		if (do_beep1600) {
			send_beep1600();
			do_beep1600 = false;
		}
	}

	return 0;
}


int dv_in_cb(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode)
{
	uint8_t data[8 + size];

	if (!rx_state) {
		printf("rx_state to on\n");
	}
	rx_state = true;

	memcpy(data, from, 6);
	memcpy(mac_last, from, 6);
	data[6] = mode;
	data[7] = rx_state;
	memcpy(data + 8, dv, size);

	send_data(data, 8 + size);

	if (fullduplex) {
		trx_dv_send(from, mac_bcast, mode, dv, size);
	}

	dml_poll_timeout(&rx_state, rx_state ?
	    &(struct timespec){0, 100000000} :
	    &(struct timespec){0, 0} );

	return 0;
}

int state_cb(bool state)
{
	printf("state: %d\n", state);
	rx_state = state;
	
	return 0;
}

	

void command_cb_handle(char *command)
{	
	struct dml_stream *ds;
	bool is_73;
	bool do_disconnect = false;
	bool do_connect = false;

	printf("command: %s\n", command);
	
	is_73 = !strcmp(command, "73");
	do_disconnect |= is_73;
	
	if (strcmp(command, alias))
		ds = dml_stream_by_alias(command);
	else
		ds = NULL;
	if (ds && !is_73) {
		struct dml_stream_priv *priv = dml_stream_priv_get(ds);
		
		printf("Found priv: %p\n", priv);
		if (priv) {
			struct dml_crypto_key *key = dml_stream_crypto_get(ds);
			printf("match_mime: %d, key: %p\n", priv->match_mime, key);
			if (ds != cur_con && priv->match_mime && key) {
				do_disconnect = true;
				do_connect = true;
			}
		}
	}
	printf("connect: %d disconnect: %d %p %p\n", do_connect, do_disconnect, ds, cur_con);
	
	if (do_disconnect && cur_con) {
		dml_packet_send_req_disc(dml_con, dml_stream_id_get(cur_con));
		dml_packet_send_req_reverse(dml_con, dml_stream_id_get(cur_con), ref_id,
		    DML_PACKET_REQ_REVERSE_DISC);
		cur_con = NULL;
		cur_id = 0;
	}		
	if (do_connect) {
		connect(ds);
		dml_packet_send_req_reverse(dml_con, dml_stream_id_get(ds), ref_id,
		    DML_PACKET_REQ_REVERSE_CONNECT);
		do_beep800 = true;
	} else {
		do_beep1600 = true;
	}
	
}

static int command_cb(void *arg, uint8_t from[6], uint8_t to[6], char *ctrl, size_t size)
{
	static char command[100];
	static int command_len = 0;

	for (; size; size--, ctrl++) {
		command[command_len] = ctrl[0];
		command[command_len+1] = 0;
		
		if (command[command_len] == '#') {
			if (command[0] == '*') {
				command[command_len] = 0;
				command_cb_handle(command+1);
			}
			command_len = 0;
		} else {
			command_len++;
		}
		if (command_len >= sizeof(command))
			command_len = 0;
	}

	return 0;
}

int main(int argc, char **argv)
{
	struct dml_client *dc;
	char *file = "dml_trx.conf";
	char *certificate;
	char *key;
	char *server;
	char *ca;
	char *dv_dev;
	char *dv_mode;

	if (argc > 1)
		file = argv[1];

	if (dml_config_load(file)) {
		printf("Failed to load config file %s\n", file);
		return -1;
	}
	name = dml_config_value("name", NULL, "test_trx");
	alias = dml_config_value("alias", NULL, "0000");
	description = dml_config_value("description", NULL, "Test transceiver");

	server = dml_config_value("server", NULL, "localhost");
	certificate = dml_config_value("certificate", NULL, "");
	key = dml_config_value("key", NULL, "");

	fullduplex = atoi(dml_config_value("fullduplex", NULL, "0"));

	dv_dev = dml_config_value("dv_device", NULL, NULL);
	if (dv_dev) {
		dv_mode = dml_config_value("dv_mode", NULL, NULL);
		if (dv_mode) {
			printf("DV limited to mode %s", dv_mode);
		}
		if (trx_dv_init(dv_dev, dv_in_cb, command_cb, NULL, dv_mode))
			fprintf(stderr, "Could not open DV device\n");
	} else {
		fprintf(stderr, "No DV device configured\n");
		return -1;
	}
	
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

	dml_poll_add(&rx_state, NULL, NULL, rx_watchdog);

	beep800 = alaw_beep(800, 8000, 0.08);
	if (!beep800) {
		printf("Could not generate beep\n");
	}
	beep1600 = alaw_beep(1600, 8000, 0.08);
	if (!beep1600) {
		printf("Could not generate beep\n");
	}
	beepsize = 8000 * 0.08;

	dml_poll_loop();

	return 0;
}
