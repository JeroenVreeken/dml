/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015, 2016

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

#include "trx_dv.h"
#include "alaw.h"
#include <eth_ar/eth_ar.h>
#include <eth_ar/fprs.h>

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <time.h>


#define DML_TRX_DATA_KEEPALIVE 10
//#define DML_TRX_FPRS_TIMER (10 * 60)
#define DML_TRX_FPRS_TIMER (1 * 60)
#define DML_TRX_FPRS_DB_TIMER 10

#define TIME_VALID_UPLINK 	(1*60)
#define TIME_VALID_DOWNLINK	(5*60)
#define TIME_VALID_OWN 		(60*60)

#define debug(...) printf(__VA_ARGS__)

static bool fullduplex = false;

static struct dml_stream *stream_dv;
static struct dml_stream *stream_fprs;

static struct dml_connection *dml_con;

static struct dml_crypto_key *dk;

/* Stream we are connected to */
static struct dml_stream *cur_con = NULL;
static struct dml_stream *cur_db = NULL;

static int send_data_fprs(void *data, size_t size, unsigned int link, void *arg);
static void recv_data(void *data, size_t size);
static void recv_data_fprs(void *data, size_t size, uint64_t timestamp);
static void send_beep800(void);
static void send_beep1600(void);

static bool rx_state = false;
static bool tx_state = false;

static uint8_t mac_last[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
static uint8_t mac_bcast[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
static uint8_t mac_dev[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };

static double my_fprs_longitude = 0.0;
static double my_fprs_latitude = 0.0;
static char *my_fprs_text = "";


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

	uint8_t *header;
	size_t header_size;
	
	bool requested_disc;
};

static struct dml_stream_priv *stream_priv_new(void)
{
	return calloc(1, sizeof(struct dml_stream_priv));
}

static void stream_priv_free(struct dml_stream_priv *priv)
{
	free(priv);
}

static int send_data(void *data, size_t size, void *sender_arg)
{
	struct dml_stream *sender = sender_arg;
	uint64_t timestamp;
	struct timespec ts;
	uint16_t packet_id = dml_stream_data_id_get(sender);
	
	if (!packet_id)
		return -1;
	
	clock_gettime(CLOCK_REALTIME, &ts);
	timestamp = dml_ts2timestamp(&ts);
	
	dml_packet_send_data(dml_con, packet_id, data, size, timestamp, dk);
	return 0;
}


static int fprs_update_status(char *stream, char *assoc)
{
	struct fprs_frame *fprs_frame;
	uint8_t dml_data[1024];
	size_t dml_size = 1024;
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);

	fprs_frame = fprs_frame_create();
	if (!fprs_frame)
		return -1;
	
	fprs_frame_add_dmlstream(fprs_frame, stream);
	fprs_frame_add_dmlassoc(fprs_frame, assoc);
	fprs_frame_data_get(fprs_frame, dml_data, &dml_size);
	/* Send FPRS frame with callsign in FreeDV header */
	trx_dv_send_fprs(mac_dev, mac_bcast, dml_data, dml_size);

	/* Add callsign to packet for others */
	fprs_frame_add_callsign(fprs_frame, mac_dev);

	dml_size = sizeof(dml_data);
	fprs_frame_data_get(fprs_frame, dml_data, &dml_size);
	fprs_parse_data(dml_data, dml_size, &ts,
	    FPRS_PARSE_DOWNLINK,
	    TIME_VALID_OWN,
	    send_data_fprs,
	    NULL
	    );
	
	fprs_frame_destroy(fprs_frame);

	return 0;
}

static int fprs_update_mac(uint8_t mac[6])
{
	struct fprs_frame *fprs_frame;
	uint8_t dml_data[1024];
	size_t dml_size = 1024;
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);

	/* Only if it is from someone else */
	if (!memcmp(mac, mac_dev, 6))
		return 0;

	fprs_frame = fprs_frame_create();
	if (!fprs_frame)
		return -1;

	fprs_frame_add_callsign(fprs_frame, mac);
	fprs_frame_add_dmlassoc(fprs_frame, dml_stream_name_get(stream_dv));

	dml_size = sizeof(dml_data);
	fprs_frame_data_get(fprs_frame, dml_data, &dml_size);
	fprs_parse_data(dml_data, dml_size, &ts,
	    FPRS_PARSE_DOWNLINK,
	    TIME_VALID_DOWNLINK,
	    send_data_fprs,
	    NULL
	    );
	
	fprs_frame_destroy(fprs_frame);

	return 0;
}

static int fprs_timer(void *arg)
{
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);

	debug("fprs_timer elapsed\n");
	
	fprs_db_flush(ts.tv_sec);
	
	fprs_update_status(dml_stream_name_get(stream_dv),
	   cur_con ? dml_stream_name_get(cur_con) : "");


	if (my_fprs_longitude != 0.0 ||
	    my_fprs_latitude != 0.0) {
		struct fprs_frame *fprs_frame;
		uint8_t dml_data[1024];
		size_t dml_size = 1024;
	
		fprs_frame = fprs_frame_create();
		if (!fprs_frame)
			return -1;
		
		fprs_frame_add_position(fprs_frame, my_fprs_longitude, my_fprs_latitude, true);
		fprs_frame_add_symbol(fprs_frame, (uint8_t[2]){'F','&'});
		
		if (my_fprs_text && strlen(my_fprs_text))
			fprs_frame_add_comment(fprs_frame, my_fprs_text);

		fprs_frame_data_get(fprs_frame, dml_data, &dml_size);
		trx_dv_send_fprs(mac_dev, mac_bcast, dml_data, dml_size);
		
		fprs_frame_add_callsign(fprs_frame, mac_dev);
		
		dml_size = sizeof(dml_data);
		fprs_frame_data_get(fprs_frame, dml_data, &dml_size);
		fprs_parse_data(dml_data, dml_size, &ts,
		    FPRS_PARSE_DOWNLINK,
		    TIME_VALID_OWN,
		    send_data_fprs,
		    NULL
		    );
		
		fprs_frame_destroy(fprs_frame);
	}

	dml_poll_timeout(&fprs_timer, 
	    &(struct timespec){ DML_TRX_FPRS_TIMER, 0});
	    
	return 0;
}

static int fprs_db_check(void *arg)
{
	if (!cur_db) {
		struct dml_stream *ds = NULL;
	
		while ((ds = dml_stream_iterate(ds))) {
			char *mime = dml_stream_mime_get(ds);
			char *alias = dml_stream_alias_get(ds);
			struct dml_stream_priv *priv = dml_stream_priv_get(ds);
			if (mime && !strcmp(DML_MIME_FPRS, mime) &&
			    alias && !strcmp(DML_ALIAS_FPRS_DB, alias) &&
			    priv && !priv->requested_disc &&
			    !cur_db) {
				struct dml_crypto_key *ck = dml_stream_crypto_get(ds);
				if (ck) {
					cur_db = ds;
					break;
				}
			}
		}
		
		if (cur_db) {
			uint16_t data_id = alloc_data_id();
			if (!data_id)
				cur_db = NULL;

			printf("Connect to DB %p\n", cur_db);
			dml_stream_data_id_set(cur_db, data_id);
			dml_packet_send_connect(dml_con, dml_stream_id_get(cur_db), data_id);
			dml_packet_send_req_reverse(dml_con, dml_stream_id_get(cur_db), 
			    dml_stream_id_get(stream_fprs),
			    DML_PACKET_REQ_REVERSE_CONNECT);
		}
	} else {
		fprs_parse_request_flush(send_data_fprs, NULL);
	}

	dml_poll_timeout(&cur_db,
	    &(struct timespec){ DML_TRX_FPRS_DB_TIMER, 0 });
	
	return 0;
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
	fprs_update_status(dml_stream_name_get(stream_dv), dml_stream_name_get(cur_con));
	
	return 0;
}

static void rx_packet(struct dml_connection *dc, void *arg, 
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
					if (ds == cur_con) {
						cur_con = NULL;
						fprs_update_status(
						    dml_stream_name_get(stream_dv), "");
					}
					if (ds == cur_db) {
						cur_db = NULL;
					}
					stream_priv_free(priv);
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
			if (!strcmp(DML_MIME_DV_C2, dmime) ||
			    !strcmp(DML_MIME_FPRS, dmime)) {
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
			printf("Received reverse request %d\n", action);

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
				if (!priv || !priv->match_mime) {
					do_reject = true;
					do_connect = false;
				}
				if (do_connect) {
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
					    id_me,
					    DML_PACKET_REQ_REVERSE_DISC);
				}
			} else if (action & DML_PACKET_REQ_REVERSE_DISC) {
				if (ds_rev == cur_con) {
					printf("Disconnect\n");
					dml_packet_send_req_disc(dml_con, id_rev);
					cur_con = NULL;
					fprs_update_status(
					    dml_stream_name_get(stream_dv), "");
				}
				if (ds_rev == cur_db) {
					printf("DB requests disconnect\n");
					dml_packet_send_req_disc(dml_con, id_rev);
					cur_db = NULL;
					
					struct dml_stream_priv *priv = dml_stream_priv_get(ds_rev);
					if (priv) {
						priv->requested_disc = true;
					}
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
			if (ds != cur_con && ds != cur_db) {
				fprintf(stderr, "Received spurious data from %p id %d\n", ds, id);
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
					if (ds == cur_con) {
						fprintf(stderr, "Received %zd ok\n", payload_len);
						recv_data(payload_data, payload_len);
					} else {
						fprintf(stderr, "Received %zd ok from DB\n", payload_len);
						recv_data_fprs(payload_data, payload_len, timestamp);
					}
				}
			}
			break;
		}
	}
	
	return;
}

static int client_reconnect(void *clientv)
{
	struct dml_client *client = clientv;

	if (dml_client_connect(client)) {
		printf("Reconnect to DML server failed\n");
		dml_poll_timeout(client, &(struct timespec){ 2, 0 });
	}
	
	return 0;
}

static int client_connection_close(struct dml_connection *dc, void *arg)
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

static void client_connect(struct dml_client *client, void *arg)
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

static int send_data_fprs(void *data, size_t size, unsigned int link, void *arg)
{
	int r = 0;
	
	if (link & FPRS_PARSE_DOWNLINK)
		r |= trx_dv_send_fprs(mac_dev, mac_bcast, data, size);
	if (link & FPRS_PARSE_UPLINK)
		r |= send_data(data, size, stream_fprs);
	return r;
}

static void recv_data_fprs(void *data, size_t size, uint64_t timestamp)
{
	struct timespec ts;
	
	dml_timestamp2ts(&ts, timestamp);
	
	fprs_parse_data(data, size, &ts,
	    FPRS_PARSE_UPLINK,
	    TIME_VALID_UPLINK,
	    send_data_fprs,
	    NULL
	    );
}

static void recv_data(void *data, size_t size)
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

static int beepsize;
static uint8_t *beep800, *beep1600;
static bool do_beep800, do_beep1600;

static void send_beep800(void)
{
	trx_dv_send(mac_dev, mac_bcast, 'A', beep800, beepsize);
}
static void send_beep1600(void)
{
	trx_dv_send(mac_dev, mac_bcast, 'A', beep1600, beepsize);
}

static int rx_watchdog(void *arg)
{
	printf("No activity, sending state off packet\n");
	
	uint8_t data[8];

	if (rx_state)
		memcpy(data, mac_last, 6);
	else
		memset(data, 0xff, 6);
	data[6] = 0;
	data[7] = false;

	send_data(data, 8, stream_dv);

	rx_state = false;

	if (do_beep800) {
		send_beep800();
		do_beep800 = false;
	}
	if (do_beep1600) {
		send_beep1600();
		do_beep1600 = false;
	}

	dml_poll_timeout(&rx_state, 
	    &(struct timespec){ DML_TRX_DATA_KEEPALIVE, 0});

	return 0;
}


static int dv_in_cb(void *arg, uint8_t from[6], uint8_t to[6], uint8_t *dv, size_t size, int mode)
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

	send_data(data, 8 + size, stream_dv);

	if (fullduplex) {
		trx_dv_send(from, mac_bcast, mode, dv, size);
	}

	fprs_update_mac(from);

	dml_poll_timeout(&rx_state, rx_state ?
	    &(struct timespec){0, 100000000} :
	    &(struct timespec){0, 0} );

	return 0;
}



static void command_cb_handle(char *command)
{	
	struct dml_stream *ds;
	struct dml_stream_priv *priv = NULL;
	bool is_73;
	bool do_disconnect = false;
	bool do_connect = false;

	printf("command: %s\n", command);
	
	is_73 = !strcmp(command, "73");
	do_disconnect |= is_73;
	
	ds = dml_stream_by_alias(command);
	if (ds)
		priv = dml_stream_priv_get(ds);
	if (priv && priv->mine)
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
		dml_packet_send_req_reverse(dml_con, dml_stream_id_get(cur_con), 
		    dml_stream_id_get(stream_dv),
		    DML_PACKET_REQ_REVERSE_DISC);
		cur_con = NULL;
		fprs_update_status(dml_stream_name_get(stream_dv), "");
	}		
	if (do_connect) {
		connect(ds);
		dml_packet_send_req_reverse(dml_con, dml_stream_id_get(ds), 
		    dml_stream_id_get(stream_dv),
		    DML_PACKET_REQ_REVERSE_CONNECT);
		do_beep800 = true;
		
		char *constr;
		asprintf(&constr, "Connecting %s", command);
		trx_dv_send_control(mac_dev, mac_bcast, constr);
		free(constr);
	} else {
		do_beep1600 = true;
		trx_dv_send_control(mac_dev, mac_bcast, "NACK");
	}	
}

static int command_cb(void *arg, uint8_t from[6], uint8_t to[6], char *ctrl, size_t size)
{
	static char command[100];
	static int command_len = 0;

	for (; size; size--, ctrl++) {
		if (!command_len && ctrl[0] != '*')
			continue;
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
	fprs_update_mac(from);

	return 0;
}

static int fprs_cb(void *arg, uint8_t from[6], uint8_t *fprsdata, size_t size)
{
	struct fprs_frame *fprs_frame;
	uint8_t f_data[1024];
	size_t f_size = 1024;
	
	fprs_frame = fprs_frame_create();
	if (!fprs_frame)
		return -1;
	
	fprs_frame_data_set(fprs_frame, fprsdata, size);
	if (!fprs_frame_element_by_type(fprs_frame, FPRS_CALLSIGN) &&
	    !fprs_frame_element_by_type(fprs_frame, FPRS_OBJECTNAME))
		fprs_frame_add_callsign(fprs_frame, from);

	fprs_frame_data_get(fprs_frame, f_data, &f_size);

	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);
	
	fprs_parse_data(f_data, f_size, &ts,
	    FPRS_PARSE_DOWNLINK,
	    TIME_VALID_DOWNLINK,
	    send_data_fprs,
	    NULL
	    );

	fprs_frame_destroy(fprs_frame);

	fprs_update_mac(from);

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
	char *name;
	char *description;
	char *alias;
	static uint8_t id[DML_ID_SIZE];
	uint32_t bps = 6400;

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
			printf("DV limited to mode %s\n", dv_mode);
		}
		if (trx_dv_init(dv_dev, dv_in_cb, command_cb, fprs_cb, NULL, dv_mode, mac_dev))
			fprintf(stderr, "Could not open DV device\n");

		char call[ETH_AR_CALL_SIZE];
		int ssid;
		bool multicast;
		
		eth_ar_mac2call(call, &ssid, &multicast, mac_dev);
		printf("Interface address: %s-%d\n", multicast ? "MULTICAST" : call, ssid);
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
	
	
	my_fprs_longitude = atof(dml_config_value("longitude", NULL, "0.0"));
	my_fprs_latitude = atof(dml_config_value("latitude", NULL, "0.0"));
	my_fprs_text = dml_config_value("fprs_text", NULL, "");
	
	
	if (dml_id_gen(id, DML_PACKET_DESCRIPTION_VERSION_0, bps, 
	    DML_MIME_DV_C2, name, alias, description))
		return -1;
	struct dml_stream_priv *priv_dv;
	
	stream_dv = dml_stream_by_id_alloc(id);
	priv_dv = stream_priv_new();
	priv_dv->mine = true;
	dml_stream_priv_set(stream_dv, priv_dv);
    	dml_stream_name_set(stream_dv, name);
	dml_stream_alias_set(stream_dv, alias);
	dml_stream_mime_set(stream_dv, DML_MIME_DV_C2);
	dml_stream_description_set(stream_dv, description);
	dml_stream_bps_set(stream_dv, bps);

	if (dml_id_gen(id, DML_PACKET_DESCRIPTION_VERSION_0, bps, 
	    DML_MIME_FPRS, name, "", description))
		return -1;
	struct dml_stream_priv *priv_fprs;
	
	stream_fprs = dml_stream_by_id_alloc(id);
	priv_fprs = stream_priv_new();
	priv_fprs->mine = true;
	dml_stream_priv_set(stream_fprs, priv_dv);
    	dml_stream_name_set(stream_fprs, name);
	dml_stream_alias_set(stream_fprs, "");
	dml_stream_mime_set(stream_fprs, DML_MIME_FPRS);
	dml_stream_description_set(stream_fprs, description);
	dml_stream_bps_set(stream_fprs, bps);
	
	dc = dml_client_create(server, 0, client_connect, NULL);		

	if (dml_client_connect(dc)) {
		printf("Could not connect to server\n");
		return -1;
	}

	dml_poll_add(&rx_state, NULL, NULL, rx_watchdog);
	dml_poll_add(&fprs_timer, NULL, NULL, fprs_timer);
	dml_poll_add(&cur_db, NULL, NULL, fprs_db_check);

	beep800 = alaw_beep(800, 8000, 0.08);
	if (!beep800) {
		printf("Could not generate beep\n");
	}
	beep1600 = alaw_beep(1600, 8000, 0.08);
	if (!beep1600) {
		printf("Could not generate beep\n");
	}
	beepsize = 8000 * 0.08;

	dml_poll_timeout(&rx_state, 
	    &(struct timespec){ DML_TRX_DATA_KEEPALIVE, 0});
	dml_poll_timeout(&fprs_timer, 
	    &(struct timespec){ DML_TRX_FPRS_TIMER, 0});
	
	dml_poll_timeout(&cur_db,
	    &(struct timespec){ DML_TRX_FPRS_DB_TIMER, 0 });

	dml_poll_loop();

	return 0;
}
