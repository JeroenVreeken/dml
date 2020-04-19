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
#ifndef _INCLUDE_DML_SERVER_H_
#define _INCLUDE_DML_SERVER_H_

#include <glib.h>

struct dml_server;

struct dml_server *dml_server_create(void (*cb)(void *arg, int fd), void *arg);
int dml_server_fd_get(struct dml_server *ds);
gboolean dml_server_handle(GIOChannel *source, GIOCondition condition, gpointer arg);

#define DML_SERVER_PORT	7373

#endif /* _INCLUDE_DML_SERVER_H_ */
