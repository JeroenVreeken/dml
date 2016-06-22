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
#ifndef _INCLUDE_DML_ROUTE_H_
#define _INCLUDE_DML_ROUTE_H_

#include "dml.h"
#include "dml_connection.h"

int dml_route_update(uint8_t id[DML_ID_SIZE], uint8_t hops, struct dml_connection *dc);
int dml_route_remove(struct dml_connection *dc);
void dml_route_destroy(uint8_t id[DML_ID_SIZE]);

int dml_route_iterate(uint8_t prev[DML_ID_SIZE], uint8_t *hops, struct dml_connection **dc);

void dml_route_update_cb_set(void (*dml_route_update_cb)(uint8_t id[DML_ID_SIZE], uint8_t hops, struct dml_connection *dc, bool bad, uint8_t alt_hops));

struct dml_connection *dml_route_connection_get(uint8_t id[DML_ID_SIZE]);

void dml_route_sort_lock_inc(void);
void dml_route_sort_lock_dec(void);

bool dml_route_sort(void);

#endif /* _INCLUDE_DML_ROUTE_H_ */
