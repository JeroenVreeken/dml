/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015, 2016, 2017, 2021

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
#include <dml/dml_connection.h>
#include <dml/dml_packet.h>
#include <dml/dml.h>
#include <dml/dml_host.h>
#include <dml/dml_id.h>
#include <dml/dml_crypto.h>
#include "dml_config.h"
#include <dml/dml_stream.h>
#include "fprs_db.h"
#include "fprs_parse.h"
#include "dml_voice_data.h"

#include "trx_dv.h"
#include "soundlib.h"
#include <eth_ar/eth_ar.h>
#include <eth_ar/fprs.h>

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

#define RXSTATE_CHECK_TIMER_NS 100000000
#define DML_TRX_DATA_KEEPALIVE 10
#define DML_TRX_FPRS_TIMER (10 * 60)
//#define DML_TRX_FPRS_TIMER (1 * 60)
#define DML_TRX_FPRS_TIMER_INIT (10)
#define DML_TRX_FPRS_DB_TIMER 10

#define TIME_VALID_UPLINK 	(1*60)
#define TIME_VALID_DOWNLINK	(5*60)
#define TIME_VALID_OWN 		(60*60)

#define DML_TRX_LEVEL_MSG	255

#define debug(...) printf(__VA_ARGS__)

static bool fullduplex = false;
static bool digipeater = false;
static bool allow_commands = true;

static struct dml_stream *stream_dv;
static struct dml_stream *stream_fprs;

static struct dml_host *host;


/* Stream we are connected to */
static struct dml_stream *cur_con = NULL;
static struct dml_stream *cur_db = NULL;
/* Who didn't like us */
static struct dml_stream *last_db_req_disc = NULL;

static int send_data_fprs(void *data, size_t size, unsigned int link, void *arg);
static void recv_data(void *data, size_t size);
static void recv_data_fprs(void *data, size_t size, uint64_t timestamp);

static uint8_t rx_state = false;

static char command[100];
static int command_len = 0;
static char command_pipe[100];
static int command_pipe_len = 0;

static uint8_t mac_last[ETH_AR_MAC_SIZE] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
static uint8_t mac_bcast[ETH_AR_MAC_SIZE] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
static uint8_t mac_dev[ETH_AR_MAC_SIZE] = { 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };

static double my_fprs_longitude = 0.0;
static double my_fprs_latitude = 0.0;
static char *my_fprs_text = "";

static char my_call[ETH_AR_CALL_SIZE];


static uint8_t *header;

enum sound_msg {
	SOUND_MSG_SILENCE,
	SOUND_MSG_CONNECT,
	SOUND_MSG_DISCONNECT,
	SOUND_MSG_REMOTE_DISC,
	SOUND_MSG_REMOTE_DISC_400,
	SOUND_MSG_REMOTE_DISC_401,
	SOUND_MSG_REMOTE_DISC_503,
	SOUND_MSG_NOTFOUND,
	SOUND_MSG_NOTALLOWED,
	SOUND_MSG_HEADER,
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


static int send_data(void *data, size_t size, void *sender_arg)
{
	struct dml_stream *sender = sender_arg;
	struct dml_crypto_key *dk = dml_stream_crypto_get(sender);
	uint64_t timestamp;
	struct timespec ts;
	uint16_t packet_id = dml_stream_data_id_get(sender);
	struct dml_connection *con = dml_host_connection_get(host);
	
	if (!packet_id)
		return -1;
	
	clock_gettime(CLOCK_REALTIME, &ts);
	timestamp = dml_ts2timestamp(&ts);
	
	if (con)
		dml_packet_send_data(con, packet_id, data, size, timestamp, dk);
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

static int fprs_update_mac(uint8_t mac[ETH_AR_MAC_SIZE])
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

enum dml_trx_state {
	DML_TRX_ST_IDLE,
	DML_TRX_ST_CONNECTED_HEADER,
	DML_TRX_ST_CONNECTED,
	DML_TRX_ST_DISCONNECTING_OTHER,
	DML_TRX_ST_DISCONNECTING,
};

char *dml_trx_state_2_str(enum dml_trx_state state)
{
	switch(state) {
		case DML_TRX_ST_IDLE:
			return "DML_TRX_ST_IDLE";
		case DML_TRX_ST_CONNECTED_HEADER:
			return "DML_TRX_ST_CONNECTED_HEADER";
		case DML_TRX_ST_CONNECTED:
			return "DML_TRX_ST_CONNECTED";
		case DML_TRX_ST_DISCONNECTING_OTHER:
			return "DML_TRX_ST_DISCONNECTING_OTHER";
		case DML_TRX_ST_DISCONNECTING:
			return "DML_TRX_ST_DISCONNECTING";
	}
	return "unknown state";
}

enum dml_trx_state state = DML_TRX_ST_IDLE;

static void dml_trx_goto_idle(void)
{
	printf("%s -> %s\n", dml_trx_state_2_str(state), dml_trx_state_2_str(DML_TRX_ST_IDLE));

	switch(state) {
		case DML_TRX_ST_CONNECTED_HEADER:
		case DML_TRX_ST_CONNECTED:
			cur_con = NULL;
			fprs_update_status(dml_stream_name_get(stream_dv), "");
			break;
		case DML_TRX_ST_IDLE:
		case DML_TRX_ST_DISCONNECTING_OTHER:
		case DML_TRX_ST_DISCONNECTING:
			break;
	}
	
	state = DML_TRX_ST_IDLE;
}


static void dml_trx_goto_disconnecting(void)
{
	printf("%s -> %s\n", dml_trx_state_2_str(state), dml_trx_state_2_str(DML_TRX_ST_DISCONNECTING));

	struct dml_connection *con = dml_host_connection_get(host);
	if (con) {
		dml_packet_send_req_disc(con, dml_stream_id_get(cur_con));
	}

	// we don't stay long in this state.

	dml_trx_goto_idle();
}


static void dml_trx_goto_disconnecting_other(void)
{
	printf("%s -> %s\n", dml_trx_state_2_str(state), dml_trx_state_2_str(DML_TRX_ST_DISCONNECTING_OTHER));

	struct dml_connection *con = dml_host_connection_get(host);
	if (con) {
		dml_packet_send_req_reverse(con, dml_stream_id_get(cur_con), 
		    dml_stream_id_get(stream_dv),
		    DML_PACKET_REQ_REVERSE_DISC,
		    DML_STATUS_OK);
	}

	// we don't stay long in this state.

	dml_trx_goto_disconnecting();
}



static void dml_trx_goto_connected_header(struct dml_stream *ds)
{
	printf("%s -> %s\n", dml_trx_state_2_str(state), dml_trx_state_2_str(DML_TRX_ST_CONNECTED_HEADER));

	struct dml_connection *con = dml_host_connection_get(host);
	if (con) {
		dml_packet_send_req_header(con, dml_stream_id_get(ds));
		dml_host_connect(host, ds);
	}

	cur_con = ds;
	fprs_update_status(dml_stream_name_get(stream_dv), dml_stream_name_get(cur_con));

	state = DML_TRX_ST_CONNECTED_HEADER;
}

static void dml_trx_goto_connected(void)
{
	printf("%s -> %s\n", dml_trx_state_2_str(state), dml_trx_state_2_str(DML_TRX_ST_CONNECTED));

	state = DML_TRX_ST_CONNECTED_HEADER;
}




static gboolean fprs_timer(void *arg)
{
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);

	debug("fprs_timer elapsed\n");
	
	fprs_db_flush(ts.tv_sec);
	
	char *status = "";
	switch(state) {
		case DML_TRX_ST_CONNECTED_HEADER:
		case DML_TRX_ST_CONNECTED:
			status = dml_stream_name_get(cur_con);
			break;
		case DML_TRX_ST_IDLE:
		case DML_TRX_ST_DISCONNECTING_OTHER:
		case DML_TRX_ST_DISCONNECTING:
			status = "";
	}
	fprs_update_status(dml_stream_name_get(stream_dv), status);


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

	struct dml_connection *con = dml_host_connection_get(host);
	if (cur_db && con) {
		dml_packet_send_connect(con, 
		    dml_stream_id_get(cur_db), 
		    dml_stream_data_id_get(cur_db));
		dml_packet_send_req_reverse(con, dml_stream_id_get(cur_db),
		    dml_stream_id_get(stream_fprs),
		    DML_PACKET_REQ_REVERSE_CONNECT,
		    DML_STATUS_OK);
	}

	g_timeout_add_seconds(DML_TRX_FPRS_TIMER, fprs_timer, &fprs_timer);
	    
	return G_SOURCE_REMOVE;
}

static gboolean fprs_db_check(void *arg)
{
	if (!cur_db) {
		struct dml_stream *ds = NULL;
	
		while ((ds = dml_stream_iterate(ds))) {
			char *mime = dml_stream_mime_get(ds);
			char *alias = dml_stream_alias_get(ds);
			if (mime && !strcmp(DML_MIME_FPRS, mime) &&
			    alias && !strcmp(DML_ALIAS_FPRS_DB, alias) &&
			    ds != last_db_req_disc &&
			    !cur_db) {
				struct dml_crypto_key *ck = dml_stream_crypto_get(ds);
				if (ck) {
					cur_db = ds;
					break;
				}
			}
		}
		
		if (cur_db) {
			if (dml_host_connect(host, cur_db))
				cur_db = NULL;
			else
				dml_packet_send_req_reverse(dml_host_connection_get(host), dml_stream_id_get(cur_db), 
				    dml_stream_id_get(stream_fprs),
				    DML_PACKET_REQ_REVERSE_CONNECT,
				    DML_STATUS_OK);
		}
	} else {
		fprs_parse_request_flush(send_data_fprs, NULL);
	}

	g_timeout_add_seconds(DML_TRX_FPRS_DB_TIMER, fprs_db_check, &cur_db);
	
	return G_SOURCE_REMOVE;
}



static void stream_removed_cb(struct dml_host *host, struct dml_stream *ds, void *arg)
{
	switch (state) {
		case DML_TRX_ST_CONNECTED_HEADER:
		case DML_TRX_ST_CONNECTED:
			if (ds == cur_con) {
				dml_trx_goto_idle();
			}
			break;
		
		case DML_TRX_ST_IDLE:
		case DML_TRX_ST_DISCONNECTING_OTHER:
		case DML_TRX_ST_DISCONNECTING:
			break;
	}

	if (ds == cur_db) {
		cur_db = NULL;
	}
}

static void stream_data_cb(struct dml_host *host, struct dml_stream *ds, uint64_t timestamp, void *data, size_t data_size, void *arg)
{
	switch (state) {
		case DML_TRX_ST_CONNECTED_HEADER:
		case DML_TRX_ST_CONNECTED:
			if (ds == cur_con) {
				fprintf(stderr, "Received %zd ok\n", data_size);
				recv_data(data, data_size);
				return;
			}
			break;
			
		case DML_TRX_ST_IDLE:
		case DML_TRX_ST_DISCONNECTING_OTHER:
		case DML_TRX_ST_DISCONNECTING:
			break;
	}
		
	if (ds == cur_db) {
		fprintf(stderr, "Received %zd ok from DB\n", data_size);
		recv_data_fprs(data, data_size, timestamp);
		return;
	}

	fprintf(stderr, "Received spurious data from %s\n", dml_stream_name_get(ds));
}

static void stream_header_cb(struct dml_host *host, struct dml_stream *ds, void *header, size_t header_size, void *arg)
{
	switch (state) {
		case DML_TRX_ST_CONNECTED_HEADER:
			if (ds == cur_con) {
				fprintf(stderr, "Play header\n");
				if (header_size)
					trx_dv_send(mac_dev, mac_bcast, 'A', header, header_size, DML_TRX_LEVEL_MSG);
				
				dml_trx_goto_connected();
			}
			break;
		
		case DML_TRX_ST_CONNECTED:
		case DML_TRX_ST_IDLE:
		case DML_TRX_ST_DISCONNECTING_OTHER:
		case DML_TRX_ST_DISCONNECTING:
			break;
	}
}

static void stream_req_reverse_connect_cb(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg)
{
	bool do_reject = false;
	status = DML_STATUS_OK;

	switch (state) {
		case DML_TRX_ST_IDLE:
			if (!dml_host_mime_filter(host, ds_rev)) {
				do_reject = true;
				status = DML_STATUS_BAD;
			} else {
				struct dml_crypto_key *key = dml_stream_crypto_get(ds_rev);
				if (!key) {
					printf("No valid crypto key for this stream (yet)\n");
					do_reject = true;
					status = DML_STATUS_UNAUTHORIZED;
				} else {
					printf("Request accepted, connecting\n");

					dml_trx_goto_connected_header(ds_rev);
			
					queue_sound_msg(SOUND_MSG_CONNECT);
				}
			}
			break;
		case DML_TRX_ST_CONNECTED_HEADER:
		case DML_TRX_ST_CONNECTED:
		case DML_TRX_ST_DISCONNECTING_OTHER:
		case DML_TRX_ST_DISCONNECTING:
			if (cur_con != ds_rev) {
				do_reject = true;
				status = DML_STATUS_UNAVAILABLE;
			}
			break;
	}

	if (do_reject) {
		printf("Request rejected\n");
		dml_packet_send_req_reverse(dml_host_connection_get(host),
		    dml_stream_id_get(ds_rev), 
		    dml_stream_id_get(ds),
		    DML_PACKET_REQ_REVERSE_DISC, 
		    status);
	}
}

static void stream_req_reverse_disconnect_cb(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg)
{
	switch (state) {
		case DML_TRX_ST_CONNECTED_HEADER:
		case DML_TRX_ST_CONNECTED:
			if (ds_rev == cur_con) {
				printf("Disconnect\n");

				dml_trx_goto_disconnecting();

				int msg = SOUND_MSG_REMOTE_DISC;
				switch (status) {
					case DML_STATUS_BAD:
						msg = SOUND_MSG_REMOTE_DISC_400;
						break;
					case DML_STATUS_UNAUTHORIZED:
						msg = SOUND_MSG_REMOTE_DISC_401;
						break;
					case DML_STATUS_UNAVAILABLE:
						msg = SOUND_MSG_REMOTE_DISC_503;
						break;
					case DML_STATUS_OK:
					default:
						break;
				}
				queue_sound_msg(msg);

				return;
			}
			break;
		
		case DML_TRX_ST_IDLE:
		case DML_TRX_ST_DISCONNECTING_OTHER:
		case DML_TRX_ST_DISCONNECTING:
			break;
	}
	
	if (ds_rev == cur_db) {
		printf("DB requests disconnect\n");
		dml_packet_send_req_disc(dml_host_connection_get(host), dml_stream_id_get(ds_rev));
		cur_db = NULL;
					
		last_db_req_disc = ds_rev;
	}

}


static void connection_closed_cb(struct dml_host *host, void *arg)
{
	/* We lost the connection to dmld */

	cur_db = NULL;

	if (cur_con) {
		dml_trx_goto_idle();
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
	
	struct dml_dv_c2_header *header = data;
	uint8_t *datab = data;
	
	uint8_t mode = header->mode;
	uint8_t level = header->level;
	
//	printf("mode %d state %d\n", mode, state);
	
	if (dml_voice_data_level_check(data, size))
		return;

	if (!rx_state || fullduplex) {
		if (size > 8) {
			trx_dv_send(data, mac_bcast, mode, datab + sizeof(struct dml_dv_c2_header), size - sizeof(struct dml_dv_c2_header), level);
		}
	}
}

static gboolean rx_watchdog(void *arg)
{
	printf("No activity, sending state off packet\n");
	
	uint8_t data[8];
	struct dml_dv_c2_header *header = (void *)data;

	memcpy(header->from, rx_state ? mac_last : mac_bcast, 6);
	header->level = 0;
	header->mode = 0;

	send_data(data, sizeof(data), stream_dv);

	rx_state = 0;
	/* Flush command buffer */
	command_len = 0;

	int extra_wait_ms = 0;
	while (sound_msg_q) {
		uint8_t *data;
		size_t size;
		
		data = soundlib_get(SOUND_MSG_SILENCE, &size);
		if (data) {
			trx_dv_send(mac_dev, mac_bcast, 'A', data, size, DML_TRX_LEVEL_MSG);
			extra_wait_ms += trx_dv_duration(size, 'A');
		}

		struct sound_msg_e *e = sound_msg_q;

		extra_wait_ms += trx_dv_duration(e->size, 'A');
		trx_dv_send(mac_dev, mac_bcast, 'A', e->data, e->size, DML_TRX_LEVEL_MSG);
		
		if (e->free_data)
			free(e->data);
		
		sound_msg_q = e->next;
		free(e);
	}

	g_timeout_add_seconds(DML_TRX_DATA_KEEPALIVE + (extra_wait_ms + 500)/1000, rx_watchdog, &rx_state);

	return G_SOURCE_REMOVE;
}

static int dv_in_cb(void *arg, uint8_t from[ETH_AR_MAC_SIZE], uint8_t to[ETH_AR_MAC_SIZE], uint8_t *dv, size_t size, int mode, uint8_t level)
{
	uint8_t data[8 + size];

	if (!rx_state) {
		printf("rx_state to on, level: %d\n", level);
	}
	rx_state = level;

	memcpy(data, from, 6);
	memcpy(mac_last, from, 6);
	data[6] = mode;
	data[7] = rx_state;
	memcpy(data + 8, dv, size);

	send_data(data, 8 + size, stream_dv);

	fprs_update_mac(from);

	g_source_remove_by_user_data(&rx_state);
	if (rx_state) {
		if (!fullduplex) {
			dml_voice_data_exclude(from, level);
		}
		g_timeout_add(RXSTATE_CHECK_TIMER_NS/1000000, rx_watchdog, &rx_state);
	} else {
		g_timeout_add_seconds(DML_TRX_DATA_KEEPALIVE, rx_watchdog, &rx_state);
	}

	return 0;
}



static void command_cb_handle(char *command)
{	
	struct dml_stream *ds = NULL;
	bool is_73;
	bool req_disconnect = false;
	bool req_connect = false;
	bool do_nack = false;
	struct dml_connection *con = dml_host_connection_get(host);

	/* Skip empty commands */
	if (!strlen(command))
		return;

	printf("command: %s\n", command);
	
	is_73 = !strcmp(command, "73");
	req_disconnect |= is_73;
	
	/* try to find by alias directly */
	ds = dml_stream_by_alias(command);
	if (!ds) {
		/* Second attempt: try to find with added prefix */
		char *command_pref;
		
		asprintf(&command_pref, "%s%s", command_prefix, command);
		ds = dml_stream_by_alias(command_pref);
		free(command_pref);
	}
	if (!ds && !is_73) {
		queue_sound_msg(SOUND_MSG_NOTFOUND);
		queue_sound_spell(command);
		do_nack = true;
	}
	if (ds && dml_stream_mine_get(ds))
		ds = NULL;


	if (ds && !is_73) {
		struct dml_crypto_key *key = dml_stream_crypto_get(ds);
		printf("match_mime: %d, key: %p\n", dml_host_mime_filter(host, ds), key);
		if (ds != cur_con && dml_host_mime_filter(host, ds)) {
			if (key) {
				req_connect = true;
			} else {
				do_nack = true;
				queue_sound_msg(SOUND_MSG_NOTALLOWED);
				queue_sound_spell(command);
			}
		}
	}
	printf("connect: %d disconnect: %d %s %s\n", req_connect, req_disconnect, 
	   ds ? dml_stream_name_get(ds) : "UNKNOWN", 
	   cur_con ? dml_stream_name_get(cur_con) : "NONE");
	
	switch (state) {
		case DML_TRX_ST_CONNECTED_HEADER:
		case DML_TRX_ST_CONNECTED:
			if (req_disconnect) {
				dml_trx_goto_disconnecting_other();
				queue_sound_msg(SOUND_MSG_DISCONNECT);
			}
			break;

		case DML_TRX_ST_IDLE:
			if (req_connect) {

				dml_trx_goto_connected_header(ds);

				dml_packet_send_req_reverse(con, dml_stream_id_get(ds), 
				    dml_stream_id_get(stream_dv),
				    DML_PACKET_REQ_REVERSE_CONNECT,
				    DML_STATUS_OK);

				queue_sound_msg(SOUND_MSG_CONNECT);
		
				char *constr;
				if (asprintf(&constr, "Connecting %s", command) >= 0) {
					trx_dv_send_control(mac_dev, mac_bcast, constr);
					free(constr);
				}
			}
			break;
		
		case DML_TRX_ST_DISCONNECTING_OTHER:
		case DML_TRX_ST_DISCONNECTING:
			break;
	}
	
	if (do_nack) {
		trx_dv_send_control(mac_dev, mac_bcast, "NACK");
	}	
}

static int command_cb(void *arg, uint8_t from[ETH_AR_MAC_SIZE], uint8_t to[ETH_AR_MAC_SIZE], char *ctrl, size_t size)
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

static gboolean command_pipe_cb(GIOChannel *source, GIOCondition condition, gpointer arg)
{
	int fd = *(int*)arg;
	static char c;

	ssize_t r = read(fd, &c, 1);
	
	if (r == 1) {
		if (c == '\r')
			return TRUE;
		if (c == '\n') {
			if (command_pipe_len) {
				command_pipe[command_pipe_len] = 0;
				if (allow_commands)
					command_cb_handle(command_pipe);
				command_pipe_len = 0;
				return TRUE;
			}
		}
		
		command_pipe[command_pipe_len] = c;
		command_pipe_len++;
		
		if (command_pipe_len >= sizeof(command_pipe))
			command_pipe_len = 0;
	}
	
	return TRUE;
}


static int fprs_cb(void *arg, uint8_t from[ETH_AR_MAC_SIZE], uint8_t *fprsdata, size_t size)
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
	
	if (digipeater) {
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

void mac_dev_cb(uint8_t mac[ETH_AR_MAC_SIZE])
{
	int ssid;
	bool multicast;

	memcpy(mac_dev, mac, 6);
	if (header) {
		memcpy(header, mac, 6);
	}
		
	eth_ar_mac2call(my_call, &ssid, &multicast, mac_dev);
	printf("Interface address %02x:%02x:%02x:%02x:%02x:%02x %s-%d\n",
	    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5],
	    multicast ? "MULTICAST" : my_call, ssid);
}

static char prev_msg[256] = {0};
static char prev_id[256] = {0};
static uint8_t prev_from[ETH_AR_MAC_SIZE] = {0};

int message_cb(uint8_t to[ETH_AR_MAC_SIZE], uint8_t from[ETH_AR_MAC_SIZE], 
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
	char *file = "dml_trx.conf";
	char *certificate;
	char *key;
	char *dv_dev;
	char *name;
	char *description;
	char *alias;
	char *command_pipe_name;
	static uint8_t id[DML_ID_SIZE];
	uint32_t bps = 6400;
	struct dml_crypto_key *dk;
	int fd_command;
	GIOChannel *io_command = NULL;

	if (argc > 1)
		file = argv[1];

	host = dml_host_create(file);
	if (!host) {
		printf("Could not create host\n");
		return -1;
	}
	name = dml_config_value("name", NULL, "test_trx");
	alias = dml_config_value("alias", NULL, "0000");
	description = dml_config_value("description", NULL, "Test transceiver");

	certificate = dml_config_value("certificate", NULL, "");
	key = dml_config_value("key", NULL, "");

	fullduplex = atoi(dml_config_value("fullduplex", NULL, "0"));
	digipeater = atoi(dml_config_value("digipeater", NULL, "0"));
	allow_commands = atoi(dml_config_value("allow_commands", NULL, "0"));
	command_pipe_name = dml_config_value("command_pipe_name", NULL, NULL);

	my_fprs_longitude = atof(dml_config_value("longitude", NULL, "0.0"));
	my_fprs_latitude = atof(dml_config_value("latitude", NULL, "0.0"));
	my_fprs_text = dml_config_value("fprs_text", NULL, "");

	command_prefix = dml_config_value("command_prefix", NULL, "");

	dv_dev = dml_config_value("dv_device", NULL, NULL);
	if (dv_dev) {
		if (trx_dv_init(dv_dev, dv_in_cb, command_cb, fprs_cb, NULL, mac_dev_cb))
			fprintf(stderr, "Could not open DV device\n");
	} else {
		fprintf(stderr, "No DV device configured\n");
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
	
	stream_dv = dml_stream_by_id_alloc(id);
	dml_stream_mine_set(stream_dv, true);
	dml_stream_crypto_set(stream_dv, dk);
    	dml_stream_name_set(stream_dv, name);
	dml_stream_alias_set(stream_dv, alias);
	dml_stream_mime_set(stream_dv, DML_MIME_DV_C2);
	dml_stream_description_set(stream_dv, description);
	dml_stream_bps_set(stream_dv, bps);

	if (dml_id_gen(id, DML_PACKET_DESCRIPTION_VERSION_0, bps, 
	    DML_MIME_FPRS, name, "", description))
		return -1;
	
	stream_fprs = dml_stream_by_id_alloc(id);
	dml_stream_mine_set(stream_fprs, true);
	dml_stream_crypto_set(stream_fprs, dk);
    	dml_stream_name_set(stream_fprs, name);
	dml_stream_alias_set(stream_fprs, "");
	dml_stream_mime_set(stream_fprs, DML_MIME_FPRS);
	dml_stream_description_set(stream_fprs, description);
	dml_stream_bps_set(stream_fprs, bps);
	
	dml_host_connection_closed_cb_set(host, connection_closed_cb, NULL);
	dml_host_mime_filter_set(host, 2, (char*[]){ DML_MIME_DV_C2 , DML_MIME_FPRS });
	dml_host_stream_removed_cb_set(host, stream_removed_cb, NULL);
	dml_host_stream_header_cb_set(host, stream_header_cb, NULL);
	dml_host_stream_data_cb_set(host, stream_data_cb, NULL);
	dml_host_stream_req_reverse_connect_cb_set(host, stream_req_reverse_connect_cb, NULL);
	dml_host_stream_req_reverse_disconnect_cb_set(host, stream_req_reverse_disconnect_cb, NULL);

	fprs_parse_hook_message(message_cb, NULL);


	char *soundlib_voice = dml_config_value("soundlib_voice", NULL, NULL);
	if (soundlib_init(8000, soundlib_voice)) {
		printf("Could not init soundlib\n");
		return -1;
	}
	
	soundlib_add_silence(SOUND_MSG_SILENCE, 0.64);
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

	char *soundlib_header = dml_config_value("soundlib_header", NULL, NULL);
	if (soundlib_header) {
		soundlib_add_file(SOUND_MSG_HEADER, soundlib_header);
		size_t header_size;
		uint8_t *sl_header = soundlib_get(SOUND_MSG_HEADER, &header_size);
		if (sl_header) {
			header = calloc(1, header_size + sizeof(struct dml_dv_c2_header));
			struct dml_dv_c2_header *dv_header = (void*)header;
			memcpy(header + sizeof(struct dml_dv_c2_header), sl_header, header_size);
			
			memcpy(dv_header->from, mac_dev, 6);
			dv_header->mode = 'A';
			dv_header->level = 255;
			dml_stream_header_set(stream_dv, header, header_size + 8);
		}
	}

	size_t size;
	uint8_t *data;
	char *message_connect = dml_config_value("message_connect", NULL, NULL);
	if (message_connect) {
		data = soundlib_synthesize(message_connect, &size);
		soundlib_add(SOUND_MSG_CONNECT, data, size);
	}
	char *message_disconnect = dml_config_value("message_disconnect", NULL, NULL);
	if (message_disconnect) {
		data = soundlib_synthesize(message_disconnect, &size);
		soundlib_add(SOUND_MSG_DISCONNECT, data, size);
	}
	char *message_remote_disconnect = dml_config_value("message_remote_disconnect", NULL, NULL);
	if (message_remote_disconnect) {
		data = soundlib_synthesize(message_remote_disconnect, &size);
		soundlib_add(SOUND_MSG_REMOTE_DISC, data, size);
	}
	char *message_remote_disconnect_400 = dml_config_value("message_remote_disconnect_400", NULL, NULL);
	if (message_remote_disconnect_400) {
		data = soundlib_synthesize(message_remote_disconnect_400, &size);
		soundlib_add(SOUND_MSG_REMOTE_DISC_400, data, size);
	}
	char *message_remote_disconnect_401 = dml_config_value("message_remote_disconnect_401", NULL, NULL);
	if (message_remote_disconnect_401) {
		data = soundlib_synthesize(message_remote_disconnect_401, &size);
		soundlib_add(SOUND_MSG_REMOTE_DISC_401, data, size);
	}
	char *message_remote_disconnect_503 = dml_config_value("message_remote_disconnect_503", NULL, NULL);
	if (message_remote_disconnect_503) {
		data = soundlib_synthesize(message_remote_disconnect_503, &size);
		soundlib_add(SOUND_MSG_REMOTE_DISC_503, data, size);
	}
	char *message_notfound = dml_config_value("message_notfound", NULL, NULL);
	if (message_notfound) {
		data = soundlib_synthesize(message_notfound, &size);
		soundlib_add(SOUND_MSG_NOTFOUND, data, size);
	}
	char *message_notallowed = dml_config_value("message_notallowed", NULL, NULL);
	if (message_notallowed) {
		data = soundlib_synthesize(message_notallowed, &size);
		soundlib_add(SOUND_MSG_NOTALLOWED, data, size);
	}

	if (command_pipe_name) {
		printf("Create command pipe at %s\n", command_pipe_name);
		remove(command_pipe_name);
		if (mkfifo(command_pipe_name, S_IRUSR | S_IWUSR | S_IWGRP)) {
			printf("Could not create command pipe\n");
			return -1;
		}
		fd_command = open(command_pipe_name, O_RDWR | O_NONBLOCK);
		if (fd_command < 0) {
			printf("Could not open command pipe\n");
			return -1;
		}
	}
	
	io_command = g_io_channel_unix_new(fd_command);
	g_io_channel_set_encoding(io_command, NULL, NULL);
	g_io_add_watch(io_command, G_IO_IN, command_pipe_cb, &fd_command);

	g_timeout_add_seconds(DML_TRX_DATA_KEEPALIVE, rx_watchdog, &rx_state);
	g_timeout_add_seconds(DML_TRX_FPRS_TIMER_INIT, fprs_timer, &fprs_timer);
	
	g_timeout_add_seconds(DML_TRX_FPRS_DB_TIMER, fprs_db_check, &cur_db);

	g_main_loop_run(g_main_loop_new(NULL, false));
	g_io_channel_unref(io_command);

	return 0;
}
