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
#include <dml/dml_route.h>

#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <stdio.h>
#include <dml/dml_id.h>


struct dml_route_link {
	struct dml_connection *dc;
	uint8_t hops;
};

struct dml_route {
	uint8_t id[DML_ID_SIZE];
	
	struct dml_route_link *link;
	int links;
	
	int lowest;
	
	struct dml_route *next;
};

static struct dml_route *route_list = NULL;

static void (*dml_route_update_cb)(uint8_t id[DML_ID_SIZE], uint8_t hops, struct dml_connection *dc, bool bad, uint8_t alt_hops) = NULL;

void dml_route_update_cb_set(void (*cb)(uint8_t id[DML_ID_SIZE], uint8_t hops, struct dml_connection *dc, bool bad, uint8_t alt_hops))
{
	dml_route_update_cb = cb;
}

struct dml_route *route_create(uint8_t id[DML_ID_SIZE])
{
	struct dml_route *route;
	
	route = calloc(1, sizeof(struct dml_route));
	
	memcpy(route->id, id, DML_ID_SIZE);
	route->next = route_list;
	route_list = route;
	
	return route;
}

void dml_route_destroy(uint8_t id[DML_ID_SIZE])
{
	struct dml_route **entry;
	
	for (entry = &route_list; *entry; entry = &(*entry)->next) {
		struct dml_route *route = *entry;
		
		if (!memcmp(route->id, id, DML_ID_SIZE)) {
			*entry = route->next;
			
			if (route->links)
				free(route->link);
			free(route);
			
			return;
		}
	}
}

struct dml_route *route_search(uint8_t id[DML_ID_SIZE])
{
	struct dml_route *route;
	
	for (route = route_list; route; route = route->next)
		if (!memcmp(route->id, id, DML_ID_SIZE))
			return route;
	
	return NULL;
}

int dml_route_update(uint8_t id[DML_ID_SIZE], uint8_t hops, struct dml_connection *dc)
{
	struct dml_route *route;
	int i;
	uint8_t old_hops = 255;
	bool changed = false;
	
	route = route_search(id);
	if (!route) {
		if (hops != 255)
			route = route_create(id);
		else
			return 0;
	}
	if (route->links) {
		old_hops = route->link[route->lowest].hops;
	}
	
	for (i = 0; i < route->links; i++) {
		if (route->link[i].dc == dc) {
			if (route->lowest == i && route->link[i].hops != hops)
				changed = true;
			break;
		}
	}
	if (i == route->links) {
		route->link = realloc(route->link, sizeof(struct dml_route_link) * (i + 1));
		route->links++;
		route->link[i].dc = dc;
		if (route->links == 1) {
			route->lowest = 0;
		}
	}
	route->link[i].hops = hops;

	char *idstr = dml_id_str(id);
	printf("Received route update: %s link %d (%d hops)\n", idstr, i, hops);
	free(idstr);
	
	for (i = 0; i < route->links; i++) {
		printf("\tLink %d: %d hops\n", i, route->link[i].hops);
		if (route->link[i].hops < route->link[route->lowest].hops) {
			printf("\tNew lowest routing: link %d (%d hops) < link %d (%d hops)\n",
			    i, route->link[i].hops, 
			    route->lowest, route->link[route->lowest].hops);
			route->lowest = i;
			changed = true;
		}
	}

	if (route->link[route->lowest].hops != old_hops || changed) {
		if (dml_route_update_cb) {
			uint8_t new_hops = route->link[route->lowest].hops;
			uint8_t alt_hops = 255;
			
			for (i = 0; i < route->links; i++) {
				if (i == route->lowest)
					continue;
				if (route->link[i].hops < alt_hops)
					alt_hops = route->link[i].hops;
			}
			
			bool bad = route->link[route->lowest].hops > old_hops;
			if (route->link[route->lowest].hops == 255)
				bad = true;

			printf("\tUpdate routing: link %d (%d hops, %d alt hops, bad=%d)\n",
			    route->lowest, route->link[route->lowest].hops, alt_hops, bad);
			dml_route_update_cb(id, new_hops, route->link[route->lowest].dc, bad, alt_hops);
		}
	}

	return 0;
}
 
int dml_route_remove(struct dml_connection *dc)
{
	struct dml_route *route;
	bool was_lowest = false;
	
	for (route = route_list; route; route = route->next) {
		int i;
		uint8_t old_hops = route->links ? route->link[route->lowest].hops : 255;
		bool origin = false;
		
		for (i = 0; i < route->links; i++) {
			if (route->link[i].dc == dc) {
				if (route->link[i].hops == 0)
					origin = true;
				break;
			}
		}

		char *idstr = dml_id_str(route->id);
		printf("Remove route : %s link %d %p\n", idstr, i, dc);
		if (origin)
			printf("--Removing origin\n");
		free(idstr);
		if (i < route->links) {
			if (route->lowest == i) {
				route->lowest = 0;
				was_lowest = true;
			}
			
			memmove(route->link + i, route->link + i + 1, sizeof(struct dml_route_link) * (route->links - i - 1));
			route->link = realloc(route->link, sizeof(struct dml_route_link) * (route->links - 1));
			route->links--;
			
			if (route->lowest > i)
				route->lowest--;
		}
		
		for (i = 0; i < route->links; i++) {
			/* If we lost the origin, the alt routes will soon go up. 
			   Prevent a loop by not advertising them
			 */
			if (origin)
				route->link[i].hops = 255;
				
			printf("\tLink %d: %d hops\n", i, route->link[i].hops);
			if (route->link[i].hops < route->link[route->lowest].hops)
				route->lowest = i;
		}

		uint8_t new_hops = route->links ? route->link[route->lowest].hops : 255;
		if (new_hops != old_hops || was_lowest) {
			bool bad = new_hops > old_hops;
			struct dml_connection *dc = route->links ? route->link[route->lowest].dc : NULL;
			if (dml_route_update_cb) {
				uint8_t alt_hops = 255;
			
				for (i = 0; i < route->links; i++) {
					if (i == route->lowest)
						continue;
					if (route->link[i].hops < alt_hops)
						alt_hops = route->link[i].hops;
				}
			
				printf("\tRemoved route link %d (%d hops, %d alt hops)\n",
				    dc ? route->lowest : -1, new_hops, alt_hops);
				dml_route_update_cb(route->id, new_hops, dc, bad, alt_hops);
			}
		}
	}
	
	return 0;
}

int dml_route_iterate(uint8_t prev[DML_ID_SIZE], uint8_t *hops, struct dml_connection **dc)
{
	struct dml_route *entry;
	bool start = !memcmp(prev, (uint8_t [DML_ID_SIZE]){ 0 }, DML_ID_SIZE);
	
	for (entry = route_list; entry; entry = entry->next) {
//		printf("%d %p\n", start, entry);
		if (start || !memcmp(entry->id, prev, DML_ID_SIZE)) {
			if (!start)
				entry = entry->next;
			for (; entry; entry = entry->next) {
				if (entry->lowest < entry->links) {
					*hops = entry->link[entry->lowest].hops;
					*dc = entry->link[entry->lowest].dc;
				} else {
					*hops = 255;
					*dc = NULL;
				}
				memcpy(prev, entry->id, DML_ID_SIZE);
				return 0;
				
			}
			break;
		}
	}
	return -1;
}

struct dml_connection *dml_route_connection_get(uint8_t id[DML_ID_SIZE])
{
	struct dml_route *entry;
	
	for (entry = route_list; entry; entry = entry->next) {
		if (!memcmp(entry->id, id, DML_ID_SIZE)) {
			if (entry->links && entry->link[entry->lowest].hops < 255) {
				return entry->link[entry->lowest].dc;
			} else {
				return NULL;
			}
		}
	}
	return NULL;
}


static int dml_route_sort_lock = 0;
void dml_route_sort_lock_inc(void)
{
	dml_route_sort_lock++;
}

void dml_route_sort_lock_dec(void)
{
	dml_route_sort_lock--;
}

bool dml_route_sort(void)
{
	bool sorted = false;
	
	if (dml_route_sort_lock)
		return sorted;

	struct dml_route **entry;
	int lasthops = 0;
	
	for (entry = &route_list; *entry; entry = &(*entry)->next) {
		int hops = 255;

		if ((*entry)->links)
			hops = (*entry)->link[(*entry)->lowest].hops;

		if (hops < lasthops) {
			struct dml_route *tmp;
			
			/* remove entry from list*/
			tmp = *entry;
			*entry = (*entry)->next;
			
			tmp->next = route_list;
			route_list = tmp;
			
			/* Jump to second entry in list */
			entry = &route_list;
			
			sorted = true;
		}
		lasthops = hops;
	}
	
	return sorted;
}
