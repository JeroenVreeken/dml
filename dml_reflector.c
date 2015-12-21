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

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

uint8_t ref_id[DML_ID_SIZE];
char *mime = "audio/dml-codec2-3200";
char *name = "vwd.pe1rxq.ampr.org";
char *alias = "7001";
char *description = "Test reflector, Valkenswaard, The Netherlands";
uint32_t bps = 10000;

uint16_t packet_id = 0;

struct connection_data {
	uint8_t id[DML_ID_SIZE];
	uint16_t packet_id;

	struct connection_data *next;
};

struct connection_data *data_list;

uint16_t connection_data_new_id(void)
{
	static uint16_t id = DML_PACKET_DATA;
	struct connection_data *entry;
	
	do {
		for (entry = data_list; entry; entry = entry->next) {
			if (entry->packet_id == id) {
				id++;
				if (!id)
					id = DML_PACKET_DATA;
				break;
			}
		}
		if (!entry)
			return id;
	} while(1);
}

void reverse_connect(struct dml_connection *dc, uint8_t id[DML_ID_SIZE])
{
	//todo check header mime type
	//todo retrieve cert & verify
	
	struct connection_data *entry;
	
	for (entry = data_list; entry; entry = entry->next) {
		if (!memcmp(entry->id, id, DML_ID_SIZE))
			return;
	}
	
	entry = calloc(1, sizeof(struct connection_data));
	if (!entry)
		return;
	memcpy(entry->id, id, DML_ID_SIZE);
	entry->packet_id = connection_data_new_id();
	
	entry->next = data_list;
	data_list = entry;
	
	dml_packet_send_connect(dc, id, entry->packet_id);
}

void reverse_disc(struct dml_connection *dc, uint8_t id[DML_ID_SIZE])
{
	struct connection_data **entry;
	
	for (entry = &data_list; *entry; entry = &(*entry)->next) {
		if (!memcmp((*entry)->id, id, DML_ID_SIZE)) {
			struct connection_data *old = *entry;
			
			*entry = old->next;
			
			dml_packet_send_req_disc(dc, id);
			
			free(old);
		}
	}
}

void rx_packet(struct dml_connection *dc, void *arg, 
    uint16_t id, uint16_t len, uint8_t *data)
{
	printf("got id: %d\n", id);
	
	switch(id) {
		case DML_PACKET_REQ_DESCRIPTION: {
			/* No need to unpack the request,
			   we only have one stream...*/
			dml_packet_send_description(dc, ref_id, 
			    DML_PACKET_DESCRIPTION_VERSION_0, bps,
			    mime, name, alias, description);
			break;
		}
		case DML_PACKET_CONNECT: {
			uint8_t id[DML_ID_SIZE];
			
			dml_packet_parse_connect(data, len, id, &packet_id);
			break;
		}
		case DML_PACKET_REQ_DISC: {
			uint8_t id[DML_ID_SIZE];
			
			if (dml_packet_parse_req_disc(data, len, id))
				break;
			dml_packet_send_disc(dc, id, DML_PACKET_DISC_REQUESTED);
			
			if (!memcmp(id, ref_id, DML_ID_SIZE))
				packet_id = 0;
			break;
		}
		case DML_PACKET_REQ_REVERSE: {
			uint8_t id[DML_ID_SIZE];
			uint8_t id_rev[DML_ID_SIZE];
			uint8_t action;
			
			if (dml_packet_parse_req_reverse(data, len, id, id_rev, &action))
				break;
			if (action & DML_PACKET_REQ_REVERSE_CONNECT)
				reverse_connect(dc, id_rev);
			else if (action & DML_PACKET_REQ_REVERSE_DISC)
				reverse_disc(dc, id_rev);
			
			break;
		}
		default: {
			//todo verify signature
			//todo generate new signature
			dml_connection_send(dc, data, packet_id, len);
		
			break;
		}
	}
	
	return;
}

int client_connection_close(struct dml_connection *dc, void *arg)
{
	//TODO timeout and reconnect!
	return dml_connection_destroy(dc);
}

void client_connect(struct dml_client *client, void *arg)
{
	struct dml_connection *dc;
	int fd;
	
	fd = dml_client_fd_get(client);
	
	dc = dml_connection_create(fd, client, rx_packet, client_connection_close);
	dml_packet_send_hello(dc, DML_PACKET_HELLO_LEAF, "dml_reflector " DML_VERSION);
	dml_packet_send_route(dc, ref_id, 0);
}

int main(int argc, char **argv)
{
	struct dml_client *dc;
	
	if (dml_id_gen(ref_id, DML_PACKET_DESCRIPTION_VERSION_0, bps, mime, name, alias, description))
		return -1;
    	
	dc = dml_client_create("localhost", 0, client_connect, NULL);		

	if (dml_client_connect(dc)) {
		printf("Could not connect to server\n");
		return -1;
	}

	dml_poll_loop();

	return 0;
}
