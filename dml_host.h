/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2017

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
#ifndef _INCLUDE_DML_HOST_H_
#define _INCLUDE_DML_HOST_H_

#include "dml_stream.h"

struct dml_host;

struct dml_host *dml_host_create(char *server);

struct dml_connection *dml_host_connection_get(struct dml_host *host);

int dml_host_connection_closed_cb_set(struct dml_host *host, 
    void(*cb)(struct dml_host *host, void *arg), void *arg);
int dml_host_stream_added_cb_set(struct dml_host *host,
    void(*cb)(struct dml_host *host, struct dml_stream *ds, void *arg), void *arg);
int dml_host_stream_removed_cb_set(struct dml_host *host,
    void(*cb)(struct dml_host *host, struct dml_stream *ds, void *arg), void *arg);
int dml_host_stream_data_cb_set(struct dml_host *host, 
	void (*stream_data_cb)(struct dml_host *host, struct dml_stream *ds, uint64_t timestamp, void *data, size_t data_size, void *arg), void *arg);
int dml_host_stream_req_reverse_connect_cb_set(struct dml_host *host,
    void (*cb)(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg), void *arg);
int dml_host_stream_req_reverse_disconnect_cb_set(struct dml_host *host,
    void (*cb)(struct dml_host *host, struct dml_stream *ds, struct dml_stream *ds_rev, int status, void *arg), void *arg);

int dml_host_mime_filter_set(struct dml_host *host, int nr, char **mimetypes);
bool dml_host_mime_filter(struct dml_host *host, struct dml_stream *ds);

int dml_host_connect(struct dml_host *host, struct dml_stream *ds);

#endif /* _INCLUDE_DML_HOST_H_ */
