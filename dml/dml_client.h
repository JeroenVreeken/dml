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
#ifndef _INCLUDE_DML_CLIENT_H_
#define _INCLUDE_DML_CLIENT_H_

struct dml_client;

struct dml_client *dml_client_create(char *host, unsigned short port, void (*cb)(struct dml_client *, void *arg), void *arg);
int dml_client_fd_get(struct dml_client *dc);
int dml_client_connect(struct dml_client *dc);
int dml_client_destroy(struct dml_client *dc);

char *dml_client_host_get(struct dml_client *dc);

#endif /* _INCLUDE_DML_CLIENT_H_ */
