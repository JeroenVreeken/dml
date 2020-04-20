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
#include <dml/dml_host.h>
#include <dml/dml.h>
#include <dml/dml_id.h>

#include <stdlib.h>
#include <stdio.h>
#include <inttypes.h>
#include <string.h>

static GMainLoop *loop;
static int nr_ids = 0;
static int nr_added = 0;

static void stream_added_cb(struct dml_host *host, struct dml_stream *ds, void *arg)
{
	char *idstr = dml_id_str(dml_stream_id_get(ds));
	char *mime, *name, *alias, *description;
	uint32_t bps;
	
	mime = dml_stream_mime_get(ds);
	name = dml_stream_name_get(ds);
	alias = dml_stream_alias_get(ds);
	description = dml_stream_description_get(ds);
	bps = dml_stream_bps_get(ds);
	
	printf("id: %s\n\tmime: '%s'\n\tbps: %d\n\tname: '%s'\n"
	    "\talias: '%s'\n\tdescription: '%s'\n",
	    idstr, mime, bps, name, alias, description);
	
	free(idstr);
	nr_added++;
	
	if (nr_added == nr_ids) {
		g_main_loop_quit(loop);
	}
}

void update_cb(struct dml_host *host, uint32_t flags, void *arg)
{
	if (flags == DML_PACKET_UPDATE_INITIAL_DONE) {
		struct dml_stream *entry;
		
		for (entry = NULL; (entry = dml_stream_iterate(entry)); ) {
			nr_ids++;
		}
	
		printf("Received %d IDs, retrieving stream descriptions\n", nr_ids);
	}
}

int main(int argc, char **argv)
{
	struct dml_host *host;

	char *server = "localhost";
	if (argc > 1)
		server = argv[1];
	
	host = dml_host_create(server);
	if (!host) {
		printf("Could not create host\n");
		return -1;
	}

	dml_host_update_cb_set(host, update_cb, NULL);
	dml_host_stream_added_cb_set(host, stream_added_cb, NULL);

	loop = g_main_loop_new(NULL, false);
	g_main_loop_run(loop);

	return 0;
}
