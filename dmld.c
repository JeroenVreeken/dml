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

#define _GNU_SOURCE

#include <dml/dml_server.h>
#include <dml/dml_connection.h>
#include <dml/dml_packet.h>
#include <dml/dml_route.h>
#include <dml/dml.h>
#include "dml_config.h"
#include <dml/dml_client.h>
#include <dml/dml_id.h>
#include "dmld_cache.h"
#include <dml/dml_log.h>

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <netinet/ip.h>

#define DMLD_DATA_KEEPALIVE	60

struct connection_update {
	uint8_t id[DML_ID_SIZE];
	uint8_t hops;
	
	struct connection_update *next;
};

struct connection_data_client {
	struct dml_connection *dc;
	uint16_t packet_id;
	
	struct connection_data_client *next;
};

struct connection_data {
	uint8_t id[DML_ID_SIZE];
	struct dml_connection *dc;
	uint16_t packet_id;
	time_t t_data;
	
	struct connection_data_client *client_list;
	
	struct connection_data *next;
};

struct connection_data *data_list;

int connection_data_remove(struct connection_data *data);
int connection_data_remove_client(struct connection_data *data, struct dml_connection *dc);
void connection_data_update(struct dml_connection *dc, bool old_valid);

struct connection {
	struct dml_connection *dc;
	uint32_t flags;
	
	struct dml_client *client;

	uint8_t update_id[DML_ID_SIZE];
	
	struct connection_update *bad_list;
	struct connection_update *good_list;
	
	struct connection_update *req_description;
	struct connection_update *req_certificate;
	struct connection_update *req_header;
	
	char *name;
	
	int hops_offset;
	
	struct connection *next;
};

struct connection *connection_list = NULL;

struct connection *connection_create(void)
{
	struct connection *con;
	
	con = calloc(1, sizeof(struct connection));
	if (!con)
		goto err_calloc;
	
	con->name = strdup("unknown connection");
	if (!con->name)
		goto err_name;
	
	con->next = connection_list;
	connection_list = con;

	return con;

err_name:
	free(con);
err_calloc:
	return NULL;
}

char *connection_name_get(struct connection *con)
{
	return con->name;
}

int connection_name_set(struct connection *con, char *name)
{
	char *tmp = strdup(name);
	if (!tmp)
		return -1;

	int i;
	for (i = 0; i < strlen(tmp); i++) {
		if (tmp[i] == ',') {
			tmp[i] = 0;
			con->hops_offset = atoi(tmp+i+1);
			dml_log(DML_LOG_DEBUG, "Connection to %s has hops_offset of %d", tmp, con->hops_offset);
		}
	}

	free(con->name);
	con->name = tmp;
	
	return 0;
}

bool connection_valid(struct connection *con)
{
	struct connection *entry;
	
	for (entry = connection_list; entry; entry = entry->next) {
		if (entry == con)
			return true;
	}
	return false;
}

void connection_destroy(struct connection *con)
{
	struct connection **entry;
	
	for (entry = &connection_list; *entry; entry = &(*entry)->next) {
		if (*entry == con) {
			*entry = con->next;
			break;
		}
	}
	g_source_remove_by_user_data(con);
	g_source_remove_by_user_data(con);

	while (con->bad_list) {
		struct connection_update *cu = con->bad_list;
		con->bad_list = cu->next;
		free(cu);
	}
	while (con->good_list) {
		struct connection_update *cu = con->good_list;
		con->good_list = cu->next;
		free(cu);
	}
	while (con->req_description) {
		struct connection_update *cu = con->req_description;
		con->req_description = cu->next;
		free(cu);
	}
	while (con->req_certificate) {
		struct connection_update *cu = con->req_certificate;
		con->req_certificate = cu->next;
		free(cu);
	}
	while (con->req_header) {
		struct connection_update *cu = con->req_header;
		con->req_header = cu->next;
		free(cu);
	}
	
	connection_data_update(con->dc, false);

	struct connection_data *data, *dnext;

	dml_log(DML_LOG_INFO, "remove client %s from data list", con->name);
	for (data = data_list; data; data = dnext) {
		dnext = data->next;
		
		connection_data_remove_client(data, con->dc);
		if (!data->client_list && data->dc != con->dc) {
			dml_log(DML_LOG_INFO, "Sending disconnect request upstream");
			dml_packet_send_req_disc(data->dc, data->id);
			connection_data_remove(data);
		}
	}
	
	free(con->name);
	free(con);
}

struct connection_data *connection_data_create(void)
{
	struct connection_data *entry;
	
	entry = calloc(1, sizeof(struct connection_data));
	if (!entry)
		return NULL;
	entry->next = data_list;
	data_list = entry;
	
	return entry;
}

struct connection_data *connection_data_by_connection(struct dml_connection *dc, uint16_t packet_id)
{
	struct connection_data *entry;
	
	for (entry = data_list; entry; entry = entry->next) {
		if (entry->dc == dc && entry->packet_id == packet_id) {
			return entry;
		}
	}
	return NULL;
}

struct connection_data *connection_data_by_id(uint8_t id[DML_ID_SIZE])
{
	struct connection_data *entry;
	
	for (entry = data_list; entry; entry = entry->next) {
		if (!memcmp(entry->id, id, DML_ID_SIZE)) {
			return entry;
		}
	}
	return NULL;
}

int connection_data_add_client(struct connection_data *data, struct dml_connection *dc, uint16_t packet_id)
{
	struct connection_data_client *entry;
	struct connection *con = dml_connection_arg_get(dc);

	for (entry = data->client_list; entry; entry = entry->next) {
		if (entry->dc == dc)
			break;
	}
	if (!entry) {
		entry = calloc(1, sizeof(struct connection_data_client));
		if (!entry)
			return -1;
		entry->next = data->client_list;
		data->client_list = entry;
	}
	char *idstr = dml_id_str(data->id);
	dml_log(DML_LOG_INFO, "Add client to %s: %s %d", idstr, connection_name_get(con), packet_id);
	free(idstr);
	entry->packet_id = packet_id;
	entry->dc = dc;
	
	return 0;
}

int connection_data_remove_client(struct connection_data *data, struct dml_connection *dc)
{
	struct connection_data_client **entry;
	struct connection *con = dml_connection_arg_get(dc);
	
	char *idstr = dml_id_str(data->id);
	dml_log(DML_LOG_INFO, "Remove client from %s: %s", idstr, connection_name_get(con));
	free(idstr);
	for (entry = &data->client_list; *entry; entry = &(*entry)->next) {
		struct connection_data_client *old = *entry;
		if (old->dc != dc)
			continue;
		
		*entry = old->next;
		
		free(old);
		return 0;
	}
	return -1;
}

uint16_t connection_data_new_id(void)
{
	static uint16_t id = DML_PACKET_DATA;
	struct connection_data *entry;
	
	id++;
	do {
		for (entry = data_list; entry; entry = entry->next) {
			if (entry->packet_id == id) {
				id++;
				if (id < DML_PACKET_DATA)
					id = DML_PACKET_DATA;
				break;
			}
		}
		if (!entry)
			return id;
	} while(1);
}

int connection_data_remove(struct connection_data *data)
{
	struct connection_data **entry;

	char *idstr = dml_id_str(data->id);
	dml_log(DML_LOG_INFO, "Removing %s from data list", idstr);
	free(idstr);	
	for (entry = &data_list; *entry; entry = &(*entry)->next) {
		if (*entry == data) {
			*entry = data->next;
			break;
		}
	}
	
	while (data->client_list) {
		struct connection_data_client *dc = data->client_list;
		
		dml_packet_send_disc(dc->dc, data->id, DML_PACKET_DISC_UNROUTABLE);
		
		data->client_list = dc->next;
		free(dc);
	}
	
	free(data);
	return 0;
}

gboolean connection_data_keepalive(void *arg)
{
	time_t now = time(NULL);
	struct connection_data *entry;
	
	for (entry = data_list; entry; entry = entry->next) {
		if (now > entry->t_data + DMLD_DATA_KEEPALIVE) {
			char *idstr = dml_id_str(entry->id);
			struct connection *con = dml_connection_arg_get(entry->dc);
			dml_log(DML_LOG_INFO, "No data for a while, sending keepalive connect %s to %s", 
			    idstr, connection_name_get(con));
			free(idstr);
			dml_packet_send_connect(entry->dc, entry->id, entry->packet_id);
			entry->t_data = now;
		}
	}

	g_timeout_add_seconds(DMLD_DATA_KEEPALIVE, connection_data_keepalive, connection_data_keepalive);

	return G_SOURCE_REMOVE;
}



/* A connection has been updated, recheck */
void connection_data_update(struct dml_connection *dc, bool old_valid)
{
	struct connection_data *data, *dnext;
	for (data = data_list; data; data = dnext) {
		dnext = data->next;
		
		/* Is it using the connection? */
		if (data->dc != dc)
			continue;		
		
		struct dml_connection *dc_r = dml_route_connection_get(data->id);
				
		if (dc_r) {
			if (dc_r != dc) {
				data->dc = dc_r;
				dml_packet_send_connect(dc_r, data->id, data->packet_id);
				if (old_valid)
					dml_packet_send_req_disc(dc, data->id);
			}
			continue;
		}
		connection_data_remove(data);
	}
}

void update_clear(struct connection *con)
{
	memset(con->update_id, 0, DML_ID_SIZE);
}

gboolean update(void *arg)
{
	struct connection *con = arg;
//	printf("update\n");
	
	if (!connection_valid(con)) {
		dml_log(DML_LOG_DEBUG, "Update called on invalid connection");
		goto invalid;
	}
	
	while (dml_connection_send_empty(con->dc)) {
		struct connection_update *up;
		
		up = con->bad_list;
		if (up)
			con->bad_list = up->next;
		else {
			up = con->good_list;
			if (up)
				con->good_list = up->next;
		}
		if (!up)
			break;
		char *idstr = dml_id_str(up->id);
		int hops = up->hops + con->hops_offset;
		if (hops > 255)
			hops = 255;
		dml_log(DML_LOG_INFO, "Send update %s (%d hops)", idstr, hops);
		free(idstr);
		dml_packet_send_route(con->dc, up->id, hops);
		free(up);
	}
	if (!dml_connection_send_empty(con->dc)) {
		if (con->bad_list || con->good_list)
			dml_log(DML_LOG_WARNING, "Send not empty, but update waiting");
	}

//	printf("wait a little %p\n", con);
	g_timeout_add_seconds(1, update, con);

invalid:
	return G_SOURCE_REMOVE;
}

gboolean update_all(void *arg)
{
	struct connection *con = arg;

	if (!connection_valid(con)) {
		dml_log(DML_LOG_DEBUG, "Update called on invalid connection");
		goto invalid;
	}
	
	dml_route_sort_lock_dec();
//	printf("g\n");
	while (dml_connection_send_empty(con->dc)) {
		uint8_t hops;
		struct dml_connection *dc;
		int r;
		
		r = dml_route_iterate(con->update_id, &hops, &dc);
		
//		printf("r: %d\n", r);
		if (r) {
//			dml_log(DML_LOG_INFO, "switch to regular updates %p", con);
			dml_packet_send_update(con->dc, DML_PACKET_UPDATE_INITIAL_DONE);
			g_timeout_add_seconds(1, update, con);
			return G_SOURCE_REMOVE;
		}
		/* no update to the originating node */
		if (dc == con->dc)
			continue;
		
		int new_hops = hops + 1 + con->hops_offset;
		if (new_hops > 255)
			new_hops = 255;
		dml_packet_send_route(con->dc, con->update_id, new_hops);
	}
//	printf("wait a little %p\n", con);

	dml_route_sort_lock_inc();
	g_timeout_add_seconds(1, update_all, con);

invalid:
	return G_SOURCE_REMOVE;
}


void connection_update(uint8_t id[DML_ID_SIZE], uint8_t hops, struct dml_connection *dc, bool bad, uint8_t alt_hops)
{
	struct connection *con;
	
//	printf("got update\n");

	if (hops == 255 && alt_hops == 255) {
		// remove from the cache (might come back with new header)
		dmld_cache_delete(id);
	}

	for (con = connection_list; con; con = con->next) {
		struct connection_update *up, **upp;
		uint8_t up_hops = con->dc == dc ? alt_hops : hops;
		up_hops = up_hops == 255 ? 255 : up_hops + 1;
		
		for (up = con->bad_list; up; up = up->next) {
			if (!memcmp(up->id, id, DML_ID_SIZE)) {
				up->hops = up_hops;
				dml_log(DML_LOG_INFO, "Already on bad list");
				break;
			}
		}
		if (up)
			continue;
		for (upp = &con->good_list; *upp; upp = &(*upp)->next) {
			if (!memcmp((*upp)->id, id, DML_ID_SIZE)) {
				up = *upp;
				*upp = up->next;
				dml_log(DML_LOG_INFO, "Already on good list");
				break;
			}
		}
		if (!up) {
			up = malloc(sizeof(struct connection_update));
			memcpy(up->id, id, DML_ID_SIZE);
		}
		up->hops = up_hops;
		if (bad) {
			up->next = con->bad_list;
			con->bad_list = up;
			dml_log(DML_LOG_INFO, "On bad list");
			/* It is bad, so we want updates a bit faster */
			g_source_remove_by_user_data(con);
			g_timeout_add(100, update, con);
		} else {
			up->next = con->good_list;
			con->good_list = up;
			dml_log(DML_LOG_INFO, "On good list");
		}
	}
	
	struct connection_data *cdat = connection_data_by_id(id);

	if (cdat) {
		if (dc) {
			if (cdat->dc != dc) {
				dml_packet_send_req_disc(cdat->dc, cdat->id);
				cdat->dc = dc;
				dml_packet_send_connect(dc, cdat->id, cdat->packet_id);
			}
		} else {
			connection_data_remove(cdat);
		}
	}
}

int list_add(struct connection_update **list, uint8_t id[DML_ID_SIZE])
{
	struct connection_update **entry, *new_id;
	
	for (entry = list; *entry; entry = &(*entry)->next) {
		if (!memcmp(id, (*entry)->id, DML_ID_SIZE)) {
			return 0;
		} 
	}
	new_id = malloc(sizeof(struct connection_update));
	if (!new_id)
		return -1;
	
	memcpy(new_id->id, id, DML_ID_SIZE);
	new_id->next = *list;
	*list = new_id;
	
	return 0;
}

bool list_check_remove(struct connection_update **list, uint8_t id[DML_ID_SIZE])
{
	struct connection_update **entry;
	
	for (entry = list; *entry; entry = &(*entry)->next) {
		if (!memcmp(id, (*entry)->id, DML_ID_SIZE)) {
			struct connection_update *remove = *entry;
			
			*entry = (*entry)->next;
			free(remove);
			
			return true;
		}
	}
	return false;
}

void rx_packet(struct dml_connection *dc, void *arg, 
    uint16_t id, uint16_t len, uint8_t *data)
{
	struct connection *con = arg;
	
	dml_log(DML_LOG_DEBUG, "packet: %d", id);
	switch (id) {
		case DML_PACKET_HELLO:
			dml_packet_parse_hello(data, len, &con->flags, NULL);
			if (con->flags & DML_PACKET_HELLO_UPDATES) {
				update_clear(con);
				dml_route_sort_lock_inc();
				update_all(con);
			}
			break;
		case DML_PACKET_ROUTE: {
			uint8_t id[DML_ID_SIZE];
			uint8_t hops;
			
			dml_packet_parse_route(data, len, id, &hops);

			int new_hops = hops + con->hops_offset;
			if (new_hops > 255)
				new_hops = 255;
			
			dml_route_update(id, new_hops, dc);
			break;
		}
		case DML_PACKET_REQ_DESCRIPTION: {
			uint8_t id[DML_ID_SIZE];
			struct dml_connection *dc_r;
			
			dml_packet_parse_req_description(data, len, id);

			void *description;
			size_t description_size;
			if (dmld_cache_search_description(id, &description, &description_size)) {
				dml_connection_send(dc, description, DML_PACKET_DESCRIPTION, description_size);
				dml_log(DML_LOG_INFO, "Use cached description");
				break;
			}
			

			dc_r = dml_route_connection_get(id);
			if (dc_r) {
				dml_log(DML_LOG_INFO, "Request description");
				dml_packet_send_req_description(dc_r, id);
			} else {
				dml_log(DML_LOG_WARNING, "Description requested but id is not routable");
			}
			list_add(&con->req_description, id);
			
			break;
		}
		case DML_PACKET_DESCRIPTION: {
			uint8_t desc_id[DML_ID_SIZE];
			uint8_t version;
			uint32_t bps;
			char *mime, *name, *alias, *description;
			
			if (dml_packet_parse_description(data, len,
			    desc_id, &version, &bps, &mime, &name, &alias, &description))
				break;

			dmld_cache_insert_description(desc_id, data, len);

			dml_log(DML_LOG_INFO, "Got description for %s", name);

			struct connection *con;
	
			for (con = connection_list; con; con = con->next) {
				if (list_check_remove(&con->req_description, desc_id)) {
					dml_log(DML_LOG_INFO, "Send description");
					dml_connection_send(con->dc, data, id, len);
				}
			}
			free(description);
			free(alias);
			free(name);
			free(mime);
			
			break;
		}
		case DML_PACKET_REQ_CERTIFICATE: {
			uint8_t id[DML_ID_SIZE];
			struct dml_connection *dc_r;
			
			dml_packet_parse_req_certificate(data, len, id);

			void *certificate;
			size_t certificate_size;
			if (dmld_cache_search_certificate(id, &certificate, &certificate_size)) {
				dml_packet_send_certificate(dc, id, certificate, certificate_size);
				dml_log(DML_LOG_INFO, "Use cached certificate");
				break;
			}
			

			dc_r = dml_route_connection_get(id);
			if (dc_r) {
				dml_packet_send_req_certificate(dc_r, id);
			}
			list_add(&con->req_certificate, id);
			
			break;
		}
		case DML_PACKET_CERTIFICATE: {
			uint8_t id[DML_ID_SIZE];
			void *certificate_data;
			size_t certificate_len;
			
			if (dml_packet_parse_certificate(data, len, id,
			    &certificate_data, &certificate_len))
    				break;

			struct connection *con;

			dmld_cache_insert_certificate(id, certificate_data, certificate_len);
	
			for (con = connection_list; con; con = con->next) {
				if (list_check_remove(&con->req_certificate, id)) {
					dml_packet_send_certificate(con->dc, id,
					    certificate_data, certificate_len);
				}
			}
			free(certificate_data);
			
			break;
		}
		case DML_PACKET_REQ_HEADER: {
			uint8_t id[DML_ID_SIZE];
			struct dml_connection *dc_r;
			
			dml_packet_parse_req_header(data, len, id);
			
			void *header;
			size_t header_size;
			uint8_t header_sig[DML_SIG_SIZE];
			if (dmld_cache_search_header(id, header_sig, &header, &header_size)) {
				dml_packet_send_header(dc, id, header_sig, header, header_size);
				dml_log(DML_LOG_INFO, "Use cached header");
				break;
			}
			
			dc_r = dml_route_connection_get(id);
			char *idstr = dml_id_str(id);
			dml_log(DML_LOG_INFO, "Request header for %s: %p", idstr, dc_r);
			free(idstr);
			if (dc_r) {
				dml_packet_send_req_header(dc_r, id);
			}
			list_add(&con->req_header, id);
			
			break;
		}
		case DML_PACKET_HEADER: {
			uint8_t id[DML_ID_SIZE];
			uint8_t sig[DML_SIG_SIZE];
			void *header_data;
			size_t header_len;
			
			if (dml_packet_parse_header(data, len, id, sig,
			    &header_data, &header_len))
    				break;
			char *idstr = dml_id_str(id);
			dml_log(DML_LOG_INFO, "Got header for %s", idstr);
			free(idstr);

			struct connection *con;
	
			for (con = connection_list; con; con = con->next) {
				if (list_check_remove(&con->req_header, id)) {
					dml_packet_send_header(con->dc, id,
					    sig, header_data, header_len);
				}
			}

			dmld_cache_insert_header(id, sig, header_data, header_len);

			free(header_data);
			
			break;
		}
		case DML_PACKET_CONNECT: {
			uint8_t id[DML_ID_SIZE];
			uint16_t packet_id;
			
			if (dml_packet_parse_connect(data, len, id, &packet_id))
				break;

			struct connection_data *cdat = connection_data_by_id(id);
			if (!cdat) {
				struct dml_connection *dc_r = dml_route_connection_get(id);
				dml_log(DML_LOG_INFO, "No data for this id yet");
				
				if (!dc_r) {
					dml_packet_send_disc(dc, id, DML_PACKET_DISC_UNROUTABLE);
					break;
				}
				
				cdat = connection_data_create();
				cdat->packet_id = connection_data_new_id();
				cdat->dc = dc_r;
				memcpy(cdat->id, id, DML_ID_SIZE);
				
				dml_log(DML_LOG_INFO, "Sending connect");
				dml_packet_send_connect(dc_r, id, cdat->packet_id);
			}
			
			connection_data_add_client(cdat, dc, packet_id);
			break;
		}
		case DML_PACKET_DISC: {
			uint8_t id[DML_ID_SIZE];
			uint8_t reason;
			
			if (dml_packet_parse_disc(data, len, id, &reason))
				break;
			
			struct connection_data *cdat = connection_data_by_id(id);
			if (!cdat || cdat->dc != dc)
				break;
			
			if (reason & DML_PACKET_DISC_UNROUTABLE) {
				struct dml_connection *dc_r = dml_route_connection_get(id);
				
				if (dc_r && dc_r != dc) {
					cdat->dc = dc_r;
					dml_packet_send_connect(dc_r, id, cdat->packet_id);
					break;
				}
			}
			connection_data_remove(cdat);
			break;
		}
		case DML_PACKET_REQ_DISC: {
			uint8_t id[DML_ID_SIZE];
			
			if (dml_packet_parse_req_disc(data, len, id))
				break;
			
			struct connection_data *cdat = connection_data_by_id(id);
			if (!cdat)
				break;
			
			connection_data_remove_client(cdat, dc);
			dml_packet_send_disc(dc, id, DML_PACKET_DISC_REQUESTED);
			if (!cdat->client_list) {
				dml_log(DML_LOG_INFO, "Sending disconnect request upstream");
				dml_packet_send_req_disc(cdat->dc, cdat->id);
				connection_data_remove(cdat);
			}
			break;
		}
		case DML_PACKET_REQ_REVERSE: {
			uint8_t id[DML_ID_SIZE];
			uint8_t rev_id[DML_ID_SIZE];
			uint8_t action;
			uint16_t status;
			
			if (dml_packet_parse_req_reverse(data, len, id, rev_id, &action, &status))
				break;
			
			struct dml_connection *dc_r = dml_route_connection_get(id);
			if (!dc_r)
				break;
			
			dml_log(DML_LOG_INFO, "Sending req_reverse: action=%d, status=%d", action, status);
			dml_packet_send_req_reverse(dc_r, id, rev_id, action, status);
			
			break;
		}
		default: {
			/* Is it an unknown id or data? */
			if (id < DML_PACKET_DATA)
				break;

			dml_log(DML_LOG_DEBUG, "Got data (%d)", len);
			struct connection_data *cdat = connection_data_by_connection(dc, id);
			if (!cdat)
				break;
			dml_log(DML_LOG_DEBUG, "Found connection");
			
			cdat->t_data = time(NULL);
			
			struct connection_data_client *cdatc;
			
			for (cdatc = cdat->client_list; cdatc; cdatc = cdatc->next) {
				dml_log(DML_LOG_DEBUG, "Sending to client as %d", cdatc->packet_id);
				dml_connection_send_data(cdatc->dc, data, cdatc->packet_id, len);
			}

			break;
		}
	}
}


int server_connection_close(struct dml_connection *dc, void *arg)
{
	struct connection *con = arg;
	
	dml_log(DML_LOG_WARNING, "server close %p %s", dc, connection_name_get(con));
	dml_route_remove(dc);
	connection_destroy(con);
	return dml_connection_destroy(dc);
}

void server_connection(void *arg, int fd)
{
	struct dml_connection *dc;
	struct connection *con;
	char *name = NULL;

	struct sockaddr addr;
	socklen_t addrlen = sizeof(addr);
	if (!getpeername(fd, &addr, &addrlen)) {
		if (addr.sa_family == AF_INET) {
			struct sockaddr_in addr_in;
			addrlen = sizeof(addr_in);
			if (!getpeername(fd, &addr_in, &addrlen)) {
				char ip[INET_ADDRSTRLEN] = {0};
				inet_ntop(AF_INET, &addr_in.sin_addr, ip, addrlen);

				if (asprintf(&name, "server-IP4-%s:%d", ip, ntohs(addr_in.sin_port)) < 0)
					return;
			}
		} else if (addr.sa_family == AF_INET6) {
			struct sockaddr_in6 addr_in6;
			addrlen = sizeof(addr_in6);
			if (!getpeername(fd, &addr_in6, &addrlen)) {
				char ip6[INET6_ADDRSTRLEN] = {0};
				inet_ntop(AF_INET6, &addr_in6.sin6_addr, ip6, addrlen);

				if (asprintf(&name, "server-IP6-%s:%d", ip6, ntohs(addr_in6.sin6_port)) < 0)
					return;
			}		
		}
	}
	if (!name) {
		if (asprintf(&name, "server-fd:%d", fd) < 0)
			return;
	}
	
	con = connection_create();
	if (!con)
		return;
	connection_name_set(con, name);
	free(name);
	
	dc = dml_connection_create(fd, con, rx_packet, server_connection_close);
//	printf("new server connection %p %p\n", con, dc);
	con->dc = dc;
	dml_packet_send_hello(dc, DML_PACKET_HELLO_UPDATES, "dmld " DML_VERSION);
}

gboolean client_reconnect(void *clientv)
{
	struct dml_client *client = clientv;

	int r;
	if ((r = dml_client_connect(client))) {
		if (r == -2) {
			/* Address resolution ongoing... trye again a bit faster */
			dml_log(DML_LOG_DEBUG, "Continue reconnect to %s later", dml_client_host_get(client));
			g_timeout_add(100, client_reconnect, client);
		} else {
			dml_log(DML_LOG_ERROR, "Reconnect to DML server %s failed", dml_client_host_get(client));
			g_timeout_add_seconds(2, client_reconnect, client);
		}
	}
	
	return G_SOURCE_REMOVE;
}

int client_connection_close(struct dml_connection *dc, void *arg)
{
	struct connection *con = arg;
	dml_log(DML_LOG_WARNING, "client close %p %s", dc, connection_name_get(con));
	struct dml_client *client = con->client;

	g_timeout_add_seconds(1, client_reconnect, client);
	
	dml_route_remove(dc);
	connection_destroy(con);
	
	return dml_connection_destroy(dc);
}

void client_connect(struct dml_client *client, void *arg)
{
	struct dml_connection *dc;
	struct connection *con;
	char *name = arg;

	dml_log(DML_LOG_INFO, "Connected to DML server %s", name);
	
	con = connection_create();
	if (!con)
		return;
	connection_name_set(con, name);
	int fd = dml_client_fd_get(client);
	
	dc = dml_connection_create(fd, con, rx_packet, client_connection_close);
	con->dc = dc;
	con->client = client;
	dml_packet_send_hello(dc, DML_PACKET_HELLO_UPDATES, "dmld " DML_VERSION);
}

gboolean cleanup(void *arg)
{
	int r;
	static uint8_t id[DML_ID_SIZE] = { 0 };
	uint8_t hops;
	struct dml_connection *dc;

	r = dml_route_iterate(id, &hops, &dc);
	if (r) {
		memset(id, 0, sizeof(id));
	} else {
		if (hops == 255) {
			dml_log(DML_LOG_INFO, "Removing route");
			dml_route_destroy(id);
		}
	}

	if (dml_route_sort()) {
		dml_log(DML_LOG_INFO, "Sorted routes");
	}

	g_timeout_add_seconds(1, cleanup, cleanup);

	return G_SOURCE_REMOVE;
}

int main(int argc, char **argv)
{
	struct dml_server *ds;
	char *file = "dmld.conf";
	char *server = NULL;

	if (argc > 1)
		file = argv[1];

	if (dml_config_load(file)) {
		dml_log(DML_LOG_ERROR, "Failed to load config file %s", file);
		return -1;
	}
	
	bool daemonize = atoi(dml_config_value("daemon", NULL, "0"));
	if (daemonize) {
		dml_log(DML_LOG_DEBUG, "Run in background");
		dml_log_syslog(true);
		if (daemon(0, 0)) {
		   dml_log(DML_LOG_ERROR, "Failed to daemonize");
		}
	} else {
		bool debug = atoi(dml_config_value("debug", NULL, "0"));
		enum dml_log_level level = debug ? DML_LOG_DEBUG : DML_LOG_INFO;
		dml_log_level(level);
		dml_log(DML_LOG_INFO, "Run in foreground");
	}

	ds = dml_server_create(server_connection, NULL);
	if (!ds) {
		dml_log(DML_LOG_ERROR, "Could not create server");
	}
	
	while ((server = dml_config_value("server", server, NULL))) {
		struct dml_client *dc;
		char *hostname = strdup(server);
		int i;
		for (i = 0; i < strlen(hostname); i++)
			if (hostname[i]==',')
				hostname[i] = 0;
		
		dml_log(DML_LOG_INFO, "Connect to %s", hostname);
		dc = dml_client_create(hostname, 0, client_connect, strdup(server));		

		int r;
		if ((r = dml_client_connect(dc))) {
			if (r == -2) {
				/* Address resolution ongoing... trye again a bit faster */
				dml_log(DML_LOG_DEBUG, "Continue connect to %s later", hostname);
				g_timeout_add(100, client_reconnect, dc);
			} else {
				dml_log(DML_LOG_ERROR, "Failed to connect to %s, try again later", hostname);
				g_timeout_add_seconds(1, client_reconnect, dc);
			}
		}
		
		free(hostname);
	}

	dml_route_update_cb_set(connection_update);

	g_timeout_add_seconds(1, cleanup, cleanup);
	g_timeout_add(DMLD_DATA_KEEPALIVE, connection_data_keepalive, connection_data_keepalive);

	g_main_loop_run(g_main_loop_new(NULL, false));

	return 0;
}
