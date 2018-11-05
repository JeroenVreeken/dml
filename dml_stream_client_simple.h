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
#ifndef _INCLUDE_DML_STREAM_CLIENT_SIMPLE_H_
#define _INCLUDE_DML_STREAM_CLIENT_SIMPLE_H_

struct dml_stream_client;

struct dml_stream_client_simple *dml_stream_client_simple_create(
    char *server, uint8_t req_id[DML_ID_SIZE],
    void *arg,
    int (*data_cb)(void *arg, void *, size_t),
    bool verify);

struct dml_stream_client_simple *dml_stream_client_simple_search_create(
    char *server, uint8_t req_id[DML_ID_SIZE], char *name, char *alias, char *mime,
    void *arg,
    int (*data_cb)(void *arg, void *, size_t),
    bool verify);

#endif /* _INCLUDE_DML_STREAM_CLIENT_SIMPLE_H_ */

