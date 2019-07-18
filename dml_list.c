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
#include <dml/dml_client.h>
#include <dml/dml_connection.h>
#include <dml/dml_poll.h>
#include <dml/dml_packet.h>
#include <dml/dml.h>
#include <dml/dml_id.h>

#include <stdlib.h>
#include <stdio.h>
#include <inttypes.h>
#include <string.h>

struct info {
	uint8_t id[DML_ID_SIZE];
	
	struct info *next;
};

struct info *info_list;

int info_add(uint8_t id[DML_ID_SIZE])
{
	struct info *entry;
	
	for (entry = info_list; entry; entry = entry->next) {
		if (!memcmp(entry->id, id, DML_ID_SIZE))
			return -1;
	}
	
	entry = calloc(1, sizeof(struct info));
	memcpy(entry->id, id, DML_ID_SIZE);
	entry->next = info_list;
	info_list = entry;
	
	return 0;
}

void rx_packet(struct dml_connection *dc, void *arg, 
    uint16_t id, uint16_t len, uint8_t *data)
{
	switch (id) {
		case DML_PACKET_HELLO: {
			char *ident;
			uint32_t flags;
			
			dml_packet_parse_hello(data, len, &flags, &ident);
			printf("ident: '%s' flags: %08"PRIx32"\n", ident, flags);
			
			free(ident);
			break;
		}
		case DML_PACKET_ROUTE: {
			uint8_t id[DML_ID_SIZE];
			uint8_t hops;
			
			dml_packet_parse_route(data, len, id, &hops);

			char *idstr  = dml_id_str(id);
			printf("id: %s hops: %d\n", idstr, hops);
			free(idstr);
			
			if (!info_add(id)) {
				dml_packet_send_req_description(dc, id);
			}
			break;
		}
		case DML_PACKET_DESCRIPTION: {
			uint8_t desc_id[DML_ID_SIZE];
			uint8_t version;
			uint32_t bps;
			char *mime, *name, *alias, *description;

			dml_packet_parse_description(data, len, desc_id, &version, 
			    &bps, &mime, &name, &alias, &description);
			char *idstr = dml_id_str(desc_id);
			
			uint8_t hash_id[DML_ID_SIZE];
			dml_id_gen(hash_id, version, bps, mime, name, alias,
			    description);
			bool hash_match = !memcmp(hash_id, desc_id, DML_ID_SIZE);
			
			printf("id: %s\n\tmime: '%s'\n\tbps: %d\n\tname: '%s'\n"
			    "\talias: '%s'\n\tdescription: '%s'\n"
			    "\thash ok: %d\n",
			    idstr, mime, bps, name, alias, description,
			    hash_match);
			
			free(idstr);
			free(mime);
			free(name);
			free(alias);
			free(description);
		}
		default:
			break;
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
	dml_packet_send_hello(dc, DML_PACKET_HELLO_UPDATES, "dml_list " DML_VERSION);
}

int main(int argc, char **argv)
{
	struct dml_client *dc;

	char *host = "localhost";
	unsigned short port = 0;
	if (argc > 1)
		host = argv[1];
	if (argc > 2)
		port = atoi(argv[2]);
	
	dc = dml_client_create(host, port, client_connect, NULL);		

	if (dml_client_connect(dc)) {
		perror("Could not connect to server");
		return -1;
	}

	dml_poll_loop();

	return 0;
}
