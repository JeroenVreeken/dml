/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015, 2016, 2017

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
#include "soundlib.h"
#include <eth_ar/eth_ar.h>
#include <eth_ar/fprs.h>

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#define RXSTATE_CHECK_TIMER_NS 100000000
#define DML_TRX_DATA_KEEPALIVE 10
#define DML_TRX_FPRS_TIMER (10 * 60)
//#define DML_TRX_FPRS_TIMER (1 * 60)
#define DML_TRX_FPRS_TIMER_INIT (10)
#define DML_TRX_FPRS_DB_TIMER 10

#define TIME_VALID_UPLINK 	(1*60)
#define TIME_VALID_DOWNLINK	(5*60)
#define TIME_VALID_OWN 		(60*60)

#define debug(...) printf(__VA_ARGS__)

static bool fullduplex = false;
static bool repeater = false;
static bool allow_commands = true;

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

static bool rx_state = false;
static bool tx_state = false;

static char command[100];
static int command_len = 0;

static uint8_t mac_last[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
static uint8_t mac_bcast[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
static uint8_t mac_dev[6] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };

static double my_fprs_longitude = 0.0;
static double my_fprs_latitude = 0.0;
static char *my_fprs_text = "";

static char my_call[ETH_AR_CALL_SIZE];

static char *message_connect;
static char *message_disconnect;
static char *message_remote_disconnect;
static char *message_remote_disconnect_400;
static char *message_remote_disconnect_401;
static char *message_remote_disconnect_503;
static char *message_notfound;
static char *message_notallowed;

enum sound_msg {
	SOUND_MSG_SILENCE,
	SOUND_MSG_CONNECT,
	SOUND_MSG_DISCONNECT,
	SOUND_MSG_REMOTE_DISC,
	SOUND_MSG_NOTFOUND,
	SOUND_MSG_NOTALLOWED,
};

struct sound_msg_e {
	struct sound_msg_e *next;
	
	uint8_t *data;
	size_t size;
	bool free_data;
};

static struct sound_msg_e *sound_msg_q = NULL;
static char *command_prefix = "";

static void queue_sound_msg(enum sound_msg msg)
{
	struct sound_msg_e *ent = calloc(sizeof(struct sound_msg_e), 1);
	struct sound_msg_e **q = &sound_msg_q;

	if (!ent)
		goto err_ent;
		
	uint8_t *data;
	size_t size;
	data = soundlib_get(msg, &size);

	if (!data)
		goto err_data;
	
	ent->free_data = false;
	ent->size = size;
	ent->data = data;
	
	while (*q)
		q = &(*q)->next;
	*q = ent;

	return;
err_data:
	free(ent);
err_ent:
	return;
}

static void queue_sound_spell(char *text)
{
	size_t size;
	uint8_t *data = soundlib_spell(text, &size);
	struct sound_msg_e **q = &sound_msg_q;

	if (!data)
		return;
	
	struct sound_msg_e *ent = calloc(sizeof(struct sound_msg_e), 1);
	
	if (!ent)
		goto err_ent;
	
	ent->data = data;
	ent->size = size;
	ent->free_data = true;
	printf("Queue: %p %zd\n", data, size);
	
	while (*q)
		q = &(*q)->next;
	*q = ent;

	return;
err_ent:
	free(data);
	return;
}

static void queue_sound_synthesize(char *text)
{
	size_t size;
	uint8_t *data = soundlib_synthesize(text, &size);
	struct sound_msg_e **q = &sound_msg_q;

	if (!data)
		return;
	
	struct sound_msg_e *ent = calloc(sizeof(struct sound_msg_e), 1);
	
	if (!ent)
		goto err_ent;
	
	ent->data = data;
	ent->size = size;
	ent->free_data = true;
	printf("Queue: %p %zd\n", data, size);
	
	while (*q)
		q = &(*q)->next;
	*q = ent;

	return;
err_ent:
	free(data);
	return;
}

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
	
	/* Only if we know who send something */
	if (!memcmp(mac, mac_bcast, 6))
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

	if (cur_db) {
		dml_packet_send_connect(dml_con, 
		    dml_stream_id_get(cur_db), 
		    dml_stream_data_id_get(cur_db));
		dml_packet_send_req_reverse(dml_con, dml_stream_id_get(cur_db),
		    dml_stream_id_get(stream_fprs),
		    DML_PACKET_REQ_REVERSE_CONNECT,
		    DML_STATUS_OK);
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

			printf("Connect to DB %s\n", dml_stream_name_get(cur_db));
			dml_stream_data_id_set(cur_db, data_id);
			dml_packet_send_connect(dml_con, dml_stream_id_get(cur_db), data_id);
			dml_packet_send_req_reverse(dml_con, dml_stream_id_get(cur_db), 
			    dml_stream_id_get(stream_fprs),
			    DML_PACKET_REQ_REVERSE_CONNECT,
			    DML_STATUS_OK);
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

	printf("Connect to %s\n", dml_stream_name_get(ds));
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
			uint16_t status;
			
			if (dml_packet_parse_req_reverse(data, len, id_me, id_rev, &action, &status))
				break;
			printf("Received reverse request: %d status: %d\n", action, status);

			struct dml_stream *ds_rev = dml_stream_by_id(id_rev);
			if (!ds_rev)
				break;
			if (action & DML_PACKET_REQ_REVERSE_CONNECT) {
				bool do_reject = false;
				bool do_connect = true;
				status = DML_STATUS_OK;
				if (cur_con) {
					if (cur_con != ds_rev) {
						do_reject = true;
						status = DML_STATUS_UNAVAILABLE;
					}
					do_connect = false;
				}
				struct dml_stream_priv *priv = dml_stream_priv_get(ds_rev);
				if (!priv || !priv->match_mime) {
					do_connect = false;
					do_reject = true;
					status = DML_STATUS_BAD;
				}
				if (do_connect) {
					struct dml_crypto_key *key = dml_stream_crypto_get(ds_rev);
					if (key) {
						printf("Request accepted, connecting\n");
						connect(ds_rev);
						if (message_connect)
							queue_sound_synthesize(message_connect);
						else
							queue_sound_msg(SOUND_MSG_CONNECT);
					} else {
						printf("No valid crypto key for this stream (yet)\n");
						do_reject = true;
						status = DML_STATUS_UNAUTHORIZED;
					}
				}
				if (do_reject) {
					printf("Request rejected\n");
					dml_packet_send_req_reverse(dml_con,
					    id_rev, 
					    id_me,
					    DML_PACKET_REQ_REVERSE_DISC, 
					    status);
				}
			} else if (action & DML_PACKET_REQ_REVERSE_DISC) {
				if (ds_rev == cur_con) {
					printf("Disconnect\n");
					dml_packet_send_req_disc(dml_con, id_rev);
					cur_con = NULL;
					fprs_update_status(
					    dml_stream_name_get(stream_dv), "");

					char *synth_msg;
					switch (status) {
						case DML_STATUS_BAD:
							synth_msg = message_remote_disconnect_400;
							break;
						case DML_STATUS_UNAUTHORIZED:
							synth_msg = message_remote_disconnect_401;
							break;
						case DML_STATUS_UNAVAILABLE:
							synth_msg = message_remote_disconnect_503;
							break;
						case DML_STATUS_OK:
						default:
							synth_msg = message_remote_disconnect;
					}
					if (synth_msg)
						queue_sound_synthesize(synth_msg);
					else
						queue_sound_msg(SOUND_MSG_REMOTE_DISC);
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
				fprintf(stderr, "Received spurious data from %s id %d\n", dml_stream_name_get(ds), id);
				break;
			}
			
			dk = dml_stream_crypto_get(ds);
			if (!dk) {
				fprintf(stderr, "Could not find key for stream %s id %d\n", dml_stream_name_get(ds), id);
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
	
	cur_con = NULL;
	cur_db = NULL;

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
	
	if (!rx_state || (fullduplex && !repeater)) {
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

static int rx_watchdog(void *arg)
{
	printf("No activity, sending state off packet\n");
	
	uint8_t data[8];

	memcpy(data, rx_state ? mac_last : mac_bcast, 6);
	data[6] = 0;
	data[7] = false;

	send_data(data, 8, stream_dv);

	rx_state = false;
	/* Flush command buffer */
	command_len = 0;

	while (sound_msg_q) {
		uint8_t *data;
		size_t size;
		
		data = soundlib_get(SOUND_MSG_SILENCE, &size);
		if (data) {
			trx_dv_send(mac_dev, mac_bcast, 'A', data, size);
			trx_dv_send(mac_dev, mac_bcast, 'A', data, size);
			trx_dv_send(mac_dev, mac_bcast, 'A', data, size);
			trx_dv_send(mac_dev, mac_bcast, 'A', data, size);
		}

		struct sound_msg_e *e = sound_msg_q;

		data = e->data;
		size = e->size;
		while (size) {
			size_t sendsize = 160;
			if (size < sendsize)
				sendsize = size;
		
			trx_dv_send(mac_dev, mac_bcast, 'A', data, sendsize);
			data += sendsize;
			size -= sendsize;
		}
		
		if (e->free_data)
			free(e->data);
		
		sound_msg_q = e->next;
		free(e);
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

	if (repeater) {
		trx_dv_send(from, mac_bcast, mode, dv, size);
	}

	fprs_update_mac(from);

	dml_poll_timeout(&rx_state, rx_state ?
	    &(struct timespec){0, RXSTATE_CHECK_TIMER_NS} :
	    &(struct timespec){DML_TRX_DATA_KEEPALIVE, 0} );

	return 0;
}



static void command_cb_handle(char *command)
{	
	struct dml_stream *ds = NULL;
	struct dml_stream_priv *priv = NULL;
	bool is_73;
	bool do_disconnect = false;
	bool do_connect = false;
	bool nokey = false;
	bool notfound = false;

	/* Skip empty commands */
	if (!strlen(command))
		return;

	printf("command: %s\n", command);
	
	is_73 = !strcmp(command, "73");
	do_disconnect |= is_73;
	
	/* try to find by alias directly */
	ds = dml_stream_by_alias(command);
	if (!ds) {
		/* Second attempt: try to find with added prefix */
		char *command_pref;
		
		asprintf(&command_pref, "%s%s", command_prefix, command);
		ds = dml_stream_by_alias(command_pref);
		free(command_pref);
	}
	if (ds)
		priv = dml_stream_priv_get(ds);
	else if (!is_73)
		notfound = true;
	if (priv && priv->mine)
		ds = NULL;


	if (ds && !is_73) {
		struct dml_stream_priv *priv = dml_stream_priv_get(ds);
		
		printf("Found priv: %p\n", priv);
		if (priv) {
			struct dml_crypto_key *key = dml_stream_crypto_get(ds);
			printf("match_mime: %d, key: %p\n", priv->match_mime, key);
			if (ds != cur_con && priv->match_mime) {
				if (key) {
					do_disconnect = true;
					do_connect = true;
				} else {
					nokey = true;
				}
			}
		}
	}
	printf("connect: %d disconnect: %d %s %s\n", do_connect, do_disconnect, 
	   ds ? dml_stream_name_get(ds) : "UNKNOWN", 
	   cur_con ? dml_stream_name_get(cur_con) : "NONE");
	
	if (do_disconnect && cur_con) {
		dml_packet_send_req_disc(dml_con, dml_stream_id_get(cur_con));
		dml_packet_send_req_reverse(dml_con, dml_stream_id_get(cur_con), 
		    dml_stream_id_get(stream_dv),
		    DML_PACKET_REQ_REVERSE_DISC,
		    DML_STATUS_OK);
		cur_con = NULL;
		fprs_update_status(dml_stream_name_get(stream_dv), "");

	}		
	if (do_connect) {
		connect(ds);
		dml_packet_send_req_reverse(dml_con, dml_stream_id_get(ds), 
		    dml_stream_id_get(stream_dv),
		    DML_PACKET_REQ_REVERSE_CONNECT,
		    DML_STATUS_OK);
		if (message_connect)
			queue_sound_synthesize(message_connect);
		else
			queue_sound_msg(SOUND_MSG_CONNECT);
		queue_sound_spell(command);
		
		char *constr;
		if (asprintf(&constr, "Connecting %s", command) >= 0) {
			trx_dv_send_control(mac_dev, mac_bcast, constr);
			free(constr);
		}
	} else {
		if (notfound) {
			if (message_notfound)
				queue_sound_synthesize(message_notfound);
			else
				queue_sound_msg(SOUND_MSG_NOTFOUND);
			queue_sound_spell(command);
		} else if (nokey) {
			if (message_notallowed)
				queue_sound_synthesize(message_notallowed);
			else
				queue_sound_msg(SOUND_MSG_NOTALLOWED);
			queue_sound_spell(command);
		} else if (do_disconnect) {
			if (message_disconnect)
				queue_sound_synthesize(message_disconnect);
			else
				queue_sound_msg(SOUND_MSG_DISCONNECT);
		}
		trx_dv_send_control(mac_dev, mac_bcast, "NACK");
	}	
}

static int command_cb(void *arg, uint8_t from[6], uint8_t to[6], char *ctrl, size_t size)
{

	for (; size; size--, ctrl++) {
		if (!command_len && ctrl[0] != '*')
			continue;
		/* Star means start of a new command */
		if (ctrl[0] == '*') {
			command[0] = '*';
			command_len = 1;
			continue;
		}
		command[command_len] = ctrl[0];
		command[command_len+1] = 0;
		
		if (command[command_len] == '#') {
			if (command[0] == '*') {
				command[command_len] = 0;
				if (allow_commands)
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
	
	if (repeater) {
		/* Digipeat the incomming FPRS packet */
		trx_dv_send_fprs(mac_dev, mac_bcast, f_data, f_size);
	}
	
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

void mac_dev_cb(uint8_t mac[6])
{
	int ssid;
	bool multicast;

	memcpy(mac_dev, mac, 6);
		
	eth_ar_mac2call(my_call, &ssid, &multicast, mac_dev);
	printf("Interface address %02x:%02x:%02x:%02x:%02x:%02x %s-%d\n",
	    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5],
	    multicast ? "MULTICAST" : my_call, ssid);
}

static char prev_msg[256] = {0};
static char prev_id[256] = {0};
static uint8_t prev_from[6] = {0};

int message_cb(uint8_t to[6], uint8_t from[6], 
    void *data, size_t dsize, void *id, size_t isize, void *arg)
{
	int ssid;
	bool multicast;
	char from_call[ETH_AR_CALL_SIZE];
	char msg_asc[dsize + 1];
	char id_asc[isize + 1];

	if (memcmp(to, mac_dev, 6))
		return -1;
	
	memcpy(msg_asc, data, dsize);
	msg_asc[dsize] = 0;
	if (id) {
		memcpy(id_asc, id, isize);
		id_asc[isize] = 0;
	} else
		id_asc[0] = 0;
	
	if (!memcmp(prev_from, from, 6)) {
		if (!strcmp(prev_msg, msg_asc))
			return 0;
		if (id_asc[0] && !strcmp(id_asc, prev_id))
			return 0;
	}
	
	strncpy(prev_msg, msg_asc, 255);
	strncpy(prev_id, id_asc, 255);
	memcpy(prev_from, from, 6);
	
	eth_ar_mac2call(from_call, &ssid, &multicast, from);
	printf("Message from %s: %s, ID: %s\n", from_call, msg_asc, id_asc);

	queue_sound_synthesize("Message from:");
	queue_sound_spell(from_call);
	queue_sound_synthesize(msg_asc);

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
	repeater = atoi(dml_config_value("repeater", NULL, "0"));
	allow_commands = atoi(dml_config_value("allow_commands", NULL, "0"));

	my_fprs_longitude = atof(dml_config_value("longitude", NULL, "0.0"));
	my_fprs_latitude = atof(dml_config_value("latitude", NULL, "0.0"));
	my_fprs_text = dml_config_value("fprs_text", NULL, "");

	command_prefix = dml_config_value("command_prefix", NULL, "");

	dv_dev = dml_config_value("dv_device", NULL, NULL);
	if (dv_dev) {
		dv_mode = dml_config_value("dv_mode", NULL, NULL);
		if (dv_mode) {
			printf("DV limited to mode %s\n", dv_mode);
		}
		if (trx_dv_init(dv_dev, dv_in_cb, command_cb, fprs_cb, NULL, dv_mode, mac_dev_cb))
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

	fprs_parse_hook_message(message_cb, NULL);


	char *soundlib_voice = dml_config_value("soundlib_voice", NULL, NULL);
	if (soundlib_init(8000, soundlib_voice)) {
		printf("Could not init soundlib\n");
		return -1;
	}
	
	soundlib_add_silence(SOUND_MSG_SILENCE, 0.16);
	soundlib_add_beep(SOUND_MSG_CONNECT, 800, 0.08);
	soundlib_add_beep(SOUND_MSG_DISCONNECT, 1600, 0.16);
	soundlib_add_beep(SOUND_MSG_REMOTE_DISC, 2000, 0.16);
	soundlib_add_beep(SOUND_MSG_NOTFOUND, 1800, 0.16);
	soundlib_add_beep(SOUND_MSG_NOTALLOWED, 2400, 0.16);
	
	char *soundlib_connect = dml_config_value("soundlib_connect", NULL, NULL);
	if (soundlib_connect)
		soundlib_add_file(SOUND_MSG_CONNECT, soundlib_connect);

	char *soundlib_disconnect = dml_config_value("soundlib_disconnect", NULL, NULL);
	if (soundlib_disconnect)
		soundlib_add_file(SOUND_MSG_DISCONNECT, soundlib_disconnect);

	char *soundlib_remote_disc = dml_config_value("soundlib_remote_disc", NULL, NULL);
	if (soundlib_remote_disc)
		soundlib_add_file(SOUND_MSG_REMOTE_DISC, soundlib_remote_disc);

	char *soundlib_notfound = dml_config_value("soundlib_notfound", NULL, NULL);
	if (soundlib_notfound)
		soundlib_add_file(SOUND_MSG_NOTFOUND, soundlib_notfound);

	char *soundlib_notallowed = dml_config_value("soundlib_notallowed", NULL, NULL);
	if (soundlib_notallowed)
		soundlib_add_file(SOUND_MSG_NOTALLOWED, soundlib_notallowed);

	message_connect = dml_config_value("message_connect", NULL, NULL);
	message_disconnect = dml_config_value("message_disconnect", NULL, NULL);
	message_remote_disconnect = dml_config_value("message_remote_disconnect", NULL, NULL);
	message_remote_disconnect_400 = dml_config_value("message_remote_disconnect_400", NULL, NULL);
	message_remote_disconnect_401 = dml_config_value("message_remote_disconnect_401", NULL, NULL);
	message_remote_disconnect_503 = dml_config_value("message_remote_disconnect_503", NULL, NULL);
	message_notfound = dml_config_value("message_notfound", NULL, NULL);
	message_notallowed = dml_config_value("message_notallowed", NULL, NULL);

	dml_poll_timeout(&rx_state, 
	    &(struct timespec){ DML_TRX_DATA_KEEPALIVE, 0});
	dml_poll_timeout(&fprs_timer, 
	    &(struct timespec){ DML_TRX_FPRS_TIMER_INIT, 0});
	
	dml_poll_timeout(&cur_db,
	    &(struct timespec){ DML_TRX_FPRS_DB_TIMER, 0 });

	dml_poll_loop();

	return 0;
}
