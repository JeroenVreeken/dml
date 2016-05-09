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
#include "dml_client.h"
#include "dml_connection.h"
#include "dml_poll.h"
#include "dml_packet.h"
#include "dml.h"
#include "dml_id.h"
#include "dml_crypto.h"
#include "dml_config.h"

#include "ogg.h"
#include "matroska.h"

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include <openssl/pem.h>


uint8_t ref_id[DML_ID_SIZE];
char *mime;
char *name;
char *alias;
char *description;
uint32_t bps = 0;

uint16_t packet_id = 0;
struct dml_connection *dml_con;

bool header_done = false;
uint8_t *header;
size_t header_size = 0;

struct dml_crypto_key *dk;

void rx_packet(struct dml_connection *dc, void *arg, 
    uint16_t id, uint16_t len, uint8_t *data)
{
//	printf("got id: %d\n", id);
	
	switch(id) {
		case DML_PACKET_REQ_DESCRIPTION: {
			/* No need to unpack the request,
			   we only have one stream...*/
			dml_packet_send_description(dc, ref_id,
			    DML_PACKET_DESCRIPTION_VERSION_0, bps, mime, 
			    name, alias, description);
			break;
		}
		case DML_PACKET_CONNECT: {
			uint8_t id[DML_ID_SIZE];
			
			dml_con = dc;
			dml_packet_parse_connect(data, len, id, &packet_id);
			break;
		}
		case DML_PACKET_REQ_DISC: {
			packet_id = 0;
			dml_con = NULL;
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
		default: {
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
	dml_packet_send_hello(dc, DML_PACKET_HELLO_LEAF, "dml_streamer_ogg " DML_VERSION);
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
	timestamp = (uint64_t)ts.tv_sec << 16;
	timestamp |= prev_ctr;
	
	dml_packet_send_data(dml_con, packet_id, data, size, timestamp, dk);
}


int fd_ogg = 0;

uint8_t *pkt_data;
size_t pkt_size;

ssize_t data_cb(void *data, size_t size)
{
	if (!header_done) {
		header = realloc(header, header_size + size);
		memcpy(header + header_size, data, size);
		header_size += size;
	} else {
		pkt_data = realloc(pkt_data, pkt_size + size);
		memcpy(pkt_data + pkt_size, data, size);
		pkt_size += size;
	}

	return size;
}

int trigger_cb_m(enum matroska_trigger trig)
{
	if (trig == MATROSKA_TRIGGER_HEADER_COMPLETE) {
		header_done = true;
	} else {
		send_data(pkt_data, pkt_size);
		free(pkt_data);
		pkt_data = NULL;
		pkt_size = 0;
	}
	
	return 0;
}

int trigger_cb_o(enum ogg_trigger trig)
{
	if (trig == OGG_TRIGGER_HEADER_COMPLETE) {
		header_done = true;
	} else {
		send_data(pkt_data, pkt_size);
		free(pkt_data);
		pkt_data = NULL;
		pkt_size = 0;
	}
	
	return 0;
}

struct ogg *ogg;
struct matroska *mat;

int fd_in(void *arg)
{
	char buffer[4096];
	
	ssize_t r;
	
	r = read(fd_ogg, buffer, sizeof(buffer));
	if (r > 0) {
		if (mat)
			return matroska_parse(mat, buffer, r);
		else
			return ogg_parse(ogg, buffer, r);
	}
	
	return 0;
}


int main(int argc, char **argv)
{
	struct dml_client *dc;
	char *file = "dml_streamer.conf";
	char *certificate;
	char *key;
	char *server;
	bool use_ogg = true;

	if (argc > 1)
		file = argv[1];

	if (dml_config_load(file)) {
		printf("Failed to load config file %s\n", file);
		return -1;
	}
	mime = dml_config_value("mime", NULL, "application/ogg");
	if (strcmp(mime + strlen(mime) - 3, "ogg"))
		use_ogg = false;
	name = dml_config_value("name", NULL, "example");
	alias = dml_config_value("alias", NULL, "");
	description = dml_config_value("description", NULL, "Test stream");
	bps = atoi(dml_config_value("bps", NULL, "300000"));

	server = dml_config_value("server", NULL, "localhost");
	certificate = dml_config_value("certificate", NULL, "");
	key = dml_config_value("key", NULL, "");

	if (dml_crypto_init(NULL, NULL))
		return -1;

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


	if (use_ogg)
		ogg = ogg_create(data_cb, trigger_cb_o);
	else
		mat = matroska_create(data_cb, trigger_cb_m);

	dml_poll_add(&fd_ogg, fd_in, NULL, NULL);
	dml_poll_fd_set(&fd_ogg, 0);
	dml_poll_in_set(&fd_ogg, true);

	dml_poll_loop();

	return 0;
}
