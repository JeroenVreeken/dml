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
#ifndef _INCLUDE_DML_CONNECTION_H_
#define _INCLUDE_DML_CONNECTION_H_

#include <stdint.h>
#include <stdbool.h>
#include <glib.h>

struct dml_connection;

struct dml_connection *dml_connection_create(int fd,
	void *arg,
    	void (*rx_cb)(struct dml_connection *, void *, uint16_t id, uint16_t len, uint8_t *data),
	int (*close_cb)(struct dml_connection *, void *)
);
int dml_connection_destroy(struct dml_connection *dc);

int dml_connection_fd_get(struct dml_connection *dc);
gboolean dml_connection_handle(GIOChannel *source, GIOCondition condition, gpointer arg);
int dml_connection_send(struct dml_connection *dc, void *datav, uint16_t id, uint16_t len);
bool dml_connection_send_empty(struct dml_connection *dc);
int dml_connection_send_data(struct dml_connection *dc, void *datav, uint16_t id, uint16_t len);
void *dml_connection_arg_get(struct dml_connection *dc);

#endif /* _INCLUDE_DML_CONNECTION_H_ */
