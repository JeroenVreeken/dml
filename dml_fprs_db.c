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
#include <dml/dml_host.h>
#include <dml/dml_packet.h>
#include <dml/dml.h>
#include <dml/dml_id.h>
#include <dml/dml_crypto.h>
#include "dml_config.h"
#include <dml/dml_stream.h>
#include "fprs_db.h"
#include "fprs_parse.h"
#include "fprs_aprsis.h"

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

struct dml_host *host;

struct dml_crypto_key *dk;

static bool aprsis = false;
static char *aprsis_host;
static int aprsis_port;
static char *aprsis_call;

static int aprs_msg_nr = 0;

struct dml_stream_priv {
	unsigned int link;
	time_t time_valid;
};

struct dml_stream_priv *stream_priv_new(void)
{
	return calloc(1, sizeof(struct dml_stream_priv));
}

void stream_priv_free(struct dml_stream_priv *priv)
{
	free(priv);
}

static void stream_added_cb(struct dml_host *host, struct dml_stream *ds, void *arg)
{
	printf("New FPRS stream: %s\n", dml_stream_name_get(ds));
	dml_stream_priv_set(ds, stream_priv_new());
}

static void stream_removed_cb(struct dml_host *host, struct dml_stream *ds, void *arg)
{
	stream_priv_free(dml_stream_priv_get(ds));
}

static void stream_req_reverse_connect_cb(struct dml_host *host, struct dml_stream *ds_me, struct dml_stream *ds_rev, int status, void *arg)
{
	bool do_connect = true;

	struct dml_stream_priv *priv = dml_stream_priv_get(ds_rev);
		
	if (do_connect && priv) {
		struct dml_crypto_key *key = dml_stream_crypto_get(ds_rev);
		if (dml_host_mime_filter(host, ds_rev) && key) {
			dml_host_connect(host, ds_rev);
			if (ds_me == stream_fprs) {
				printf("Connect request to backbone\n");
				priv->link = FPRS_PARSE_UPLINK;
				priv->time_valid = TIME_VALID_UPLINK;
			} else {
				printf("Connect request to DB\n");
				priv->link = FPRS_PARSE_DOWNLINK;
				priv->time_valid = TIME_VALID_DOWNLINK;
			}
		} else {
			printf("Request rejected\n");
			dml_packet_send_req_reverse(dml_host_connection_get(host),
			    dml_stream_id_get(ds_rev), 
			    dml_stream_id_get(ds_me),
			    DML_PACKET_REQ_REVERSE_DISC, 
			    DML_STATUS_UNAUTHORIZED);
		}
	}
}

static void stream_req_reverse_disconnect_cb(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg)
{
	if (dml_stream_data_id_get(ds_rev)) {
		printf("Disconnect\n");
		dml_packet_send_req_disc(dml_host_connection_get(host), dml_stream_id_get(ds_rev));
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
			dml_packet_send_data(dml_host_connection_get(host), packet_id, data, size, timestamp, dk);

		struct fprs_frame *fprs_frame = fprs_frame_create();
		if (fprs_frame) {
			fprs_frame_data_set(fprs_frame, data, size);
			fprs_aprsis_frame(fprs_frame, NULL);
			fprs_frame_destroy(fprs_frame);
		}
	}
	if (link & FPRS_PARSE_DOWNLINK) {
printf("send to downlink\n");
		packet_id = dml_stream_data_id_get(stream_fprs_db);
		if (packet_id)
			dml_packet_send_data(dml_host_connection_get(host), packet_id, data, size, timestamp, dk);
	}
	return 0;
}


static void stream_data_cb(struct dml_host *host, struct dml_stream *from, uint64_t timestamp, void *data, size_t size, void *arg)
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

void message_cb(struct fprs_frame *frame)
{
	uint8_t data[fprs_frame_data_size(frame)];
	size_t size;
	struct timespec ts;

	clock_gettime(CLOCK_REALTIME, &ts);
	fprs_frame_data_get(frame, data, &size);

	fprs_parse_data(data, size, &ts,
	    FPRS_PARSE_UPLINK,
	    TIME_VALID_UPLINK,
	    send_data,
	    NULL
	    );

	aprs_msg_nr++;
}

static gboolean fprs_timer(void *arg)
{
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);

	debug("fprs_timer elapsed (received %d messages from APRS)\n", aprs_msg_nr);
	aprs_msg_nr = 0;
	
	fprs_db_flush(ts.tv_sec);

	if (dml_host_connection_get(host)) {
		struct dml_stream *ds = NULL;
		while ((ds = dml_stream_iterate(ds))) {
			if (dml_stream_mine_get(ds))
				continue;
			char *alias = dml_stream_alias_get(ds);
			if (!alias)
				continue;
			if (!strcmp(alias, DML_ALIAS_FPRS_BACKBONE)) {
				dml_host_connect(host, ds);
			}

		}
	}

	g_timeout_add_seconds(DML_FPRS_DB_TIMER, fprs_timer, &fprs_timer);

	return G_SOURCE_REMOVE;
}

static gboolean fprs_req_timer(void *arg)
{
	struct timespec ts;
	clock_gettime(CLOCK_REALTIME, &ts);

	fprs_parse_request_flush(send_data, NULL);

	g_timeout_add_seconds(DML_FPRS_REQ_TIMER, fprs_req_timer, &fprs_req_timer);
	    
	return G_SOURCE_REMOVE;
}

int main(int argc, char **argv)
{
	char *file = "dml_fprs_db.conf";
	char *certificate;
	char *key;
	uint8_t id[DML_ID_SIZE];
	char *name;
	char *description;
	uint32_t bps = 6400;


	if (argc > 1)
		file = argv[1];

	host = dml_host_create(file);
	if (!host) {
		printf("Could not create host\n");
		return -1;
	}
	name = dml_config_value("name", NULL, "test_db");
	description = dml_config_value("description", NULL, "Test database");

	certificate = dml_config_value("certificate", NULL, "");
	key = dml_config_value("key", NULL, "");

	aprsis_port = atoi(dml_config_value("aprsis_port", NULL, "14580"));
	aprsis_host = dml_config_value("aprsis_host", NULL, NULL);
	aprsis_call = dml_config_value("aprsis_call", NULL, NULL);

	if (aprsis_host && aprsis_call) {
		aprsis = true;
		fprs_aprsis_init(aprsis_host, aprsis_port, aprsis_call, 
		    true, message_cb);
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
	dml_stream_priv_set(stream_fprs, priv_fprs);
	dml_stream_mine_set(stream_fprs, true);
	dml_stream_crypto_set(stream_fprs, dk);
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
	dml_stream_priv_set(stream_fprs_db, priv_fprs_db);
	dml_stream_mine_set(stream_fprs_db, true);
	dml_stream_crypto_set(stream_fprs_db, dk);
    	dml_stream_name_set(stream_fprs_db, name);
	dml_stream_alias_set(stream_fprs_db, DML_ALIAS_FPRS_DB);
	dml_stream_mime_set(stream_fprs_db, DML_MIME_FPRS);
	dml_stream_description_set(stream_fprs_db, description);
	dml_stream_bps_set(stream_fprs_db, bps);

	dml_host_mime_filter_set(host, 1, (char*[]){ DML_MIME_FPRS });
	dml_host_stream_added_cb_set(host, stream_added_cb, NULL);
	dml_host_stream_removed_cb_set(host, stream_removed_cb, NULL);
	dml_host_stream_data_cb_set(host, stream_data_cb, NULL);
	dml_host_stream_req_reverse_connect_cb_set(host, stream_req_reverse_connect_cb, NULL);
	dml_host_stream_req_reverse_disconnect_cb_set(host, stream_req_reverse_disconnect_cb, NULL);

	g_timeout_add_seconds(DML_FPRS_DB_TIMER, fprs_timer, &fprs_timer);
	g_timeout_add_seconds(DML_FPRS_REQ_TIMER, fprs_req_timer, &fprs_req_timer);

	g_main_loop_run(g_main_loop_new(NULL, false));

	return 0;
}
