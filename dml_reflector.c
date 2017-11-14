/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015, 2017

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
#include <dml/dml_poll.h>
#include <dml/dml_packet.h>
#include <dml/dml.h>
#include <dml/dml_id.h>
#include <dml/dml_host.h>
#include <dml/dml_crypto.h>
#include "dml_config.h"
#include <dml/dml_stream.h>

#include <eth_ar/eth_ar.h>
#include "alaw.h"
#include "trx_dv.h"
#include "soundlib.h"

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <time.h>


#define DML_REFLECTOR_PARROT_WAIT (500*1000*1000)
#define DML_REFLECTOR_PARROT_MAX (60*60*50)

#define DML_REFLECTOR_DATA_KEEPALIVE 10

uint8_t ref_id[DML_ID_SIZE];
char *mime = "audio/dml-codec2";
char *name;
char *alias;
char *description;
uint32_t bps = 6400;
bool parrot = false;
static struct dml_stream *stream_dv;

struct dml_host *host;

struct dml_crypto_key *dk;

void send_beep(void);
static int watchdog(void *arg);

enum sound_msg {
	SOUND_MSG_HEADER,
};


static void stream_req_reverse_connect_cb(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg)
{
	bool do_connect = true;
	bool do_reject = false;

	if (do_connect) {
		struct dml_crypto_key *key = dml_stream_crypto_get(ds_rev);
		if (dml_host_mime_filter(host, ds_rev) && key) {
			if(!dml_host_connect(host, ds_rev)) {
				send_beep();
			}
		} else {
			do_reject = true;
		}
	} else {
		do_reject = true;
	}
	if (do_reject) {
		dml_packet_send_req_reverse(dml_host_connection_get(host),
		    dml_stream_id_get(ds_rev), 
		    dml_stream_id_get(ds),
		    DML_PACKET_REQ_REVERSE_DISC, DML_STATUS_UNAUTHORIZED);
	}
}

static void stream_req_reverse_disconnect_cb(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg)
{
	if (dml_stream_data_id_get(ds_rev)) {
		printf("Disconnect\n");
		dml_packet_send_req_disc(dml_host_connection_get(host), dml_stream_id_get(ds_rev));
	}
}


uint64_t prev_timestamp = 0;

void send_data(void *data, size_t size, uint64_t timestamp)
{
	struct timespec ts;
	uint64_t tmax;
	uint16_t packet_id = dml_stream_data_id_get(stream_dv);
		
	dml_poll_timeout(&watchdog, 
	    &(struct timespec){ DML_REFLECTOR_DATA_KEEPALIVE, 0});

	if (!packet_id)
		return;
	
	if (timestamp <= prev_timestamp) {
		fprintf(stderr, "Dropping packet %"PRId64"\n", timestamp);
		return;
	}

	clock_gettime(CLOCK_REALTIME, &ts);
	ts.tv_sec += 2;
	ts.tv_nsec = 0;
	tmax = dml_ts2timestamp(&ts);
	if (timestamp > tmax)
		return;
	
	prev_timestamp = timestamp;

printf("+ %016"PRIx64"\n", timestamp);
	struct dml_connection *con = dml_host_connection_get(host);
	if (con)
		dml_packet_send_data(con, packet_id, data, size, timestamp, dk);
}

struct parrot_data {
	struct parrot_data *next;
	
	void *data;
	size_t size;
	int duration;
};

struct parrot_data *parrot_queue = NULL;
struct timespec parrot_ts;


int parrot_dequeue(void *data)
{
	uint64_t parrot_timestamp;
	uint16_t packet_id = dml_stream_data_id_get(stream_dv);
	struct dml_connection *con = dml_host_connection_get(host);
	
	if (parrot_queue) {
		struct parrot_data *entry = parrot_queue;

		dml_poll_timeout(&watchdog, 
		    &(struct timespec){ DML_REFLECTOR_DATA_KEEPALIVE, 0});

		struct timespec ts;
		clock_gettime(CLOCK_REALTIME, &ts);

		if (!parrot_ts.tv_sec) {
			parrot_ts = ts;
		}
		long diff = (ts.tv_sec - parrot_ts.tv_sec) * 1000;
		diff += (ts.tv_nsec - parrot_ts.tv_nsec) / 1000000;
		if (diff < 0)
			diff = 0;
			
		long waitms = entry->duration;
		waitms -= diff;
		if (waitms < 1) {
			waitms = 1;
		}

		dml_poll_timeout(&parrot_queue,
		    &(struct timespec){ 0, waitms * 1000000});
		
		parrot_timestamp = dml_ts2timestamp(&parrot_ts);
printf("e %016"PRIx64" %ld %ld %d\n", parrot_timestamp, diff, waitms, entry->duration);
		if (con)
			dml_packet_send_data(con, packet_id, 
			    entry->data, entry->size, parrot_timestamp, dk);
		
		parrot_ts.tv_nsec += entry->duration * 1000000;
		if (parrot_ts.tv_nsec >= 1000000000) {
			parrot_ts.tv_sec++;
			parrot_ts.tv_nsec -= 1000000000;
		}
		
		parrot_queue = parrot_queue->next;
		free(entry->data);
		free(entry);
	} else {
		uint8_t data[8];

		memset(data, 0xff, 6);
		data[6] = 0;
		data[7] = 0;

		parrot_timestamp = dml_ts2timestamp(&parrot_ts);
		parrot_timestamp++;
printf("= %016"PRIx64"\n", parrot_timestamp);
		if (con)
			dml_packet_send_data(con, packet_id, data, 8, parrot_timestamp, dk);
		parrot_ts.tv_sec = 0;
	}
	
	return 0;
}

void parrot_queue_add(void *data, size_t size, int duration)
{
	struct parrot_data *entry, **listp;
	int i;
	
	entry = malloc(sizeof(struct parrot_data));
	entry->data = malloc(size);
	
	memcpy(entry->data, data, size);
	entry->size = size;
	entry->duration = duration;
	entry->next = NULL;
	
	for (listp = &parrot_queue, i = 0; *listp; listp = &(*listp)->next, i++)
		if (i > DML_REFLECTOR_PARROT_MAX) {
			free(entry->data);
			free(entry);
			return;
		}
	
	*listp = entry;

	dml_poll_timeout(&parrot_queue,
	    &(struct timespec){ 0, DML_REFLECTOR_PARROT_WAIT });
}


static bool tx_state = false;

static void stream_data_cb(struct dml_host *host, struct dml_stream *ds, uint64_t timestamp, void *data, size_t data_size, void *arg)
{
	int duration;
	
	if (data_size < 8)
		return;
	
	uint8_t *datab = data;
	
	int mode = datab[6];
	bool state = datab[7] & 0x1;
	
	duration = trx_dv_duration(data_size - 8, mode);
	
	printf("mode %d state %d duration: %d\n", mode, state, duration);
	
	if (state != tx_state) {
		char call[ETH_AR_CALL_SIZE];
		int ssid;
		bool multicast;
		
		eth_ar_mac2call(call, &ssid, &multicast, data);
		tx_state = state;
		printf("State changed to %s by %s-%d\n", state ? "ON":"OFF", multicast ? "MULTICAST" : call, ssid);
	}
	
	if (!parrot)
		send_data(data, data_size, timestamp);
	else {
		parrot_queue_add(data, data_size, duration);
	}
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
printf("%ld ", ts.tv_sec);
	timestamp = dml_ts2timestamp(&ts);
	if (timestamp <= prev_timestamp)
		timestamp = prev_timestamp + 1;;
	
	send_data(data, beepsize + 8, timestamp);
}

static int watchdog(void *arg)
{
	struct timespec ts;
	uint64_t timestamp;
	printf("No activity, sending state off packet\n");
	
	uint8_t data[8];

	memset(data, 0xff, 6);
	data[6] = 0;
	data[7] = false;

	clock_gettime(CLOCK_REALTIME, &ts);
printf("%ld ", ts.tv_sec);
	timestamp = dml_ts2timestamp(&ts);
	if (timestamp <= prev_timestamp)
		timestamp = prev_timestamp + 1;;
	
	send_data(data, 8, timestamp);

	return 0;
}


int main(int argc, char **argv)
{
	char *file = "dml_reflector.conf";
	char *certificate;
	char *key;
	char *server;
	char *ca;
	uint8_t *header;

	if (argc > 1)
		file = argv[1];

	if (dml_config_load(file)) {
		printf("Failed to load config file %s\n", file);
		return -1;
	}
	name = dml_config_value("name", NULL, "test_reflector");
	alias = dml_config_value("alias", NULL, "0000");
	description = dml_config_value("description", NULL, "Test reflector");

	parrot = atoi(dml_config_value("parrot", NULL, "0"));

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
    	
	stream_dv = dml_stream_by_id_alloc(ref_id);
	dml_stream_mine_set(stream_dv, true);
	dml_stream_crypto_set(stream_dv, dk);
    	dml_stream_name_set(stream_dv, name);
	dml_stream_alias_set(stream_dv, alias);
	dml_stream_mime_set(stream_dv, DML_MIME_DV_C2);
	dml_stream_description_set(stream_dv, description);
	dml_stream_bps_set(stream_dv, bps);
	
	host = dml_host_create(server);
	if (!host) {
		printf("Could not create host\n");
		return -1;
	}
	dml_host_mime_filter_set(host, 1, (char*[]){ DML_MIME_DV_C2 });
	dml_host_stream_data_cb_set(host, stream_data_cb, NULL);
	dml_host_stream_req_reverse_connect_cb_set(host, stream_req_reverse_connect_cb, NULL);
	dml_host_stream_req_reverse_disconnect_cb_set(host, stream_req_reverse_disconnect_cb, NULL);

	beep = alaw_beep(400, 8000, 0.08);
	if (!beep) {
		printf("Could not generate beep\n");
	}
	beepsize = 8000 * 0.08;

	char *soundlib_header = dml_config_value("soundlib_header", NULL, NULL);
	if (soundlib_header) {
		soundlib_add_file(SOUND_MSG_HEADER, soundlib_header);
		size_t header_size;
		uint8_t *sl_header = soundlib_get(SOUND_MSG_HEADER, &header_size);
		if (sl_header) {
			header = calloc(1, header_size + 8);
			memcpy(header + 8, sl_header, header_size);
			
			memset(header, 0xff, 6);
			header[6] = 'A';
			header[7] = 1;
			dml_stream_header_set(stream_dv, header, header_size + 8);
		}
	}

	if (parrot)
		dml_poll_add(&parrot_queue, NULL, NULL, parrot_dequeue);

	dml_poll_add(&watchdog, NULL, NULL, watchdog);

	dml_poll_timeout(&watchdog, 
	    &(struct timespec){ DML_REFLECTOR_DATA_KEEPALIVE, 0});

	dml_poll_loop();

	return 0;
}
