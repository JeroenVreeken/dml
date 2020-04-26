/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2020

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
#include <dml/dml_host.h>
#include <dml_config.h>

#include <gtk/gtk.h>

static GtkWidget *window;
static GtkWidget *streamlist;

struct dml_stream_priv {
	GtkWidget *label;
};


gint streamlist_sort(GtkListBoxRow *row1, GtkListBoxRow *row2, gpointer user_data)
{
	/* Do a sort based on domain, so alphabetical, but working backwards per dot. */
	struct dml_stream *ds1 = g_object_get_data(G_OBJECT(row1), "dml_stream");
	struct dml_stream *ds2 = g_object_get_data(G_OBJECT(row2), "dml_stream");
	char *name1 = dml_stream_name_get(ds1);
	char *name2 = dml_stream_name_get(ds2);

	size_t p1 = strlen(name1) - 2;
	size_t p2 = strlen(name2) - 2;
	
	while (p1 >= 0 && p2 >= 0) {
		if (name1[p1] == '.')
			p1--;
		if (name2[p2] == '.')
			p2--;
		for (; p1; p1--) {
			if (name1[p1] == '.') {
				break;
			}
		}
		for (; p2; p2--) {
			if (name2[p2] == '.') {
				break;
			}
		}

		char *suf1 = name1 + p1;
		char *suf2 = name2 + p2;
		
		int r = strcmp(suf1, suf2);
		
		if (r)
			return r;
		if (p1 == 0 || p2 == 0) {
			return p1 - p2;
		}
	}

	return 0;
}

static void stream_added_cb(struct dml_host *host, struct dml_stream *ds, void *arg)
{
	struct dml_stream_priv *priv = calloc(1, sizeof(*priv));
	char *mime, *name, *alias, *description;
	dml_stream_priv_set(ds, priv);

	mime = dml_stream_mime_get(ds);
	name = dml_stream_name_get(ds);
	alias = dml_stream_alias_get(ds);
	description = dml_stream_description_get(ds);
	
	char *lstr;
	asprintf(&lstr, "%s [%s]: %s (%s)", name, alias, description, mime);

	priv->label = gtk_label_new(lstr);
	gtk_label_set_xalign(GTK_LABEL(priv->label), 0.0);

	GtkWidget *row = gtk_list_box_row_new();
	g_object_set_data (G_OBJECT(row), "dml_stream", ds);

	gtk_container_add(GTK_CONTAINER(row), priv->label);
	gtk_container_add(GTK_CONTAINER(streamlist), row);
	gtk_widget_show_all(window);
	
	printf("%s\n", lstr);
	free(lstr);
}

void stream_removed_cb(struct dml_host *host, struct dml_stream *ds, void *arg)
{
	struct dml_stream_priv *priv = dml_stream_priv_get(ds);

	gtk_widget_destroy(priv->label);

	free(priv);	
}



int create_window(int *argc, char ***argv)
{
	gtk_init(argc, argv);

	/* Create the main, top level window */
	window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
	gtk_window_set_title(GTK_WINDOW(window), "gdml");
	gtk_window_set_position(GTK_WINDOW(window), GTK_WIN_POS_CENTER);

	gtk_window_set_default_size(GTK_WINDOW(window), 800, 500);

	g_signal_connect(window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

	streamlist = gtk_list_box_new();
	gtk_list_box_set_sort_func (GTK_LIST_BOX(streamlist), streamlist_sort, NULL, NULL);
	
	GtkWidget *streamscroll = gtk_scrolled_window_new(NULL, NULL);
	gtk_container_add(GTK_CONTAINER(streamscroll), streamlist);
	gtk_container_add(GTK_CONTAINER(window), streamscroll);

	gtk_widget_show_all(streamscroll);
	
	return 0;
}

int main (int argc, char **argv)
{
	create_window(&argc, &argv);

	struct dml_host *host;

	host = dml_host_create(NULL);
	if (!host) {
		printf("Could not create host\n");
		return -1;
	}

	dml_host_stream_added_cb_set(host, stream_added_cb, NULL);
	dml_host_stream_removed_cb_set(host, stream_removed_cb, NULL);

	gtk_main();

	printf("Saving config\n");
	dml_config_save(NULL);

	return 0;
}
