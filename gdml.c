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

#include <gst/gst.h>

#include <gtk/gtk.h>

#define debug(...) printf(__VA_ARGS__)

static GtkWidget *window;
static GtkWidget *streamlist;

GtkWidget *combo_audio_sink;

struct dml_stream_priv {
	GtkWidget *label;
};


struct device_list {
	GstDevice *device;
	
	char *name;
	
	struct device_list *next;
};

struct device_list *devices_audio_sink = NULL;



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
	
	debug("%s\n", lstr);
	free(lstr);
}

void stream_removed_cb(struct dml_host *host, struct dml_stream *ds, void *arg)
{
	struct dml_stream_priv *priv = dml_stream_priv_get(ds);

	gtk_widget_destroy(priv->label);

	free(priv);	
}


void receive_clicked(GtkButton *button, gpointer data)
{
	GtkListBoxRow *selrow = gtk_list_box_get_selected_row(GTK_LIST_BOX(streamlist));
	if (!selrow) {
		debug("nothing selected\n");
		return;
	}
	
	struct dml_stream *ds = g_object_get_data(G_OBJECT(selrow), "dml_stream");
	char *name = dml_stream_name_get(ds);
	debug("Selected: %s\n", name);
}

void connect_clicked(GtkButton *button, gpointer data)
{
	GtkListBoxRow *selrow = gtk_list_box_get_selected_row(GTK_LIST_BOX(streamlist));
	if (!selrow) {
		debug("nothing selected\n");
		return;
	}
	
	struct dml_stream *ds = g_object_get_data(G_OBJECT(selrow), "dml_stream");
	char *name = dml_stream_name_get(ds);
	debug("Selected: %s\n", name);
}

static void device_changed(void)
{
	gchar *active_name = gtk_combo_box_text_get_active_text (GTK_COMBO_BOX_TEXT(combo_audio_sink));
	if (active_name) {
		dml_config_set("device_audio_sink", active_name);
	}
	g_free(active_name);
}

static void device_update_list(void)
{
	struct device_list *entry;
	int active = -1;
	
	char *config_name = dml_config_value("device_audio_sink", NULL, NULL);

	gtk_combo_box_text_remove_all(GTK_COMBO_BOX_TEXT(combo_audio_sink));

	int i;
	for (i = 0, entry = devices_audio_sink; entry; entry = entry->next, i++) {
		gtk_combo_box_text_append(GTK_COMBO_BOX_TEXT(combo_audio_sink), NULL, entry->name);
		if (config_name && !strcmp(config_name, entry->name)) {
			active = i;
		}
	}
	if (active >= 0) {
		gtk_combo_box_set_active(GTK_COMBO_BOX(combo_audio_sink), active);
	}
	gtk_widget_show_all(combo_audio_sink);
}


int create_window(int *argc, char ***argv)
{
	/*
	   +------------------------------------+
	   |            hbox                    |
	   | +------------+ +-----------------+ |
	   | | controlbox | |  streamscroll   | |
	   | |            | | +-------------+ | |
	   | |            | | |  streamlist | | |
	   | |            | | +-------------+ | |
	   | +------------+ +-----------------+ |
	   +------------------------------------+
	
	*/
	gtk_init(argc, argv);

	/* Create the main, top level window */
	window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
	gtk_window_set_title(GTK_WINDOW(window), "gdml");
	gtk_window_set_position(GTK_WINDOW(window), GTK_WIN_POS_CENTER);

	gtk_window_set_default_size(GTK_WINDOW(window), 800, 500);

	g_signal_connect(window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

	GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
	GtkWidget *controlbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);


	streamlist = gtk_list_box_new();
	gtk_list_box_set_sort_func (GTK_LIST_BOX(streamlist), streamlist_sort, NULL, NULL);
	
	GtkWidget *streamscroll = gtk_scrolled_window_new(NULL, NULL);
	gtk_container_add(GTK_CONTAINER(streamscroll), streamlist);
	
	gtk_box_pack_end (GTK_BOX(hbox), streamscroll, true, true, 0);



	GtkWidget *button_receive = gtk_button_new_with_label("Receive");
	g_signal_connect (button_receive, "clicked", G_CALLBACK(connect_clicked), NULL);
	
	gtk_box_pack_start (GTK_BOX(controlbox), button_receive, false, false, 0);


	GtkWidget *button_connect = gtk_button_new_with_label("Connect");
	g_signal_connect (button_connect, "clicked", G_CALLBACK(connect_clicked), NULL);
	
	gtk_box_pack_start (GTK_BOX(controlbox), button_connect, false, false, 0);


	GtkWidget *label = gtk_label_new("Audio sink");
	gtk_box_pack_start (GTK_BOX(controlbox), label, false, false, 0);
	
	combo_audio_sink = gtk_combo_box_text_new();
	g_signal_connect(combo_audio_sink, "changed", G_CALLBACK(device_changed), NULL);
	gtk_box_pack_start (GTK_BOX(controlbox), combo_audio_sink, false, false, 0);
	

	gtk_box_pack_start (GTK_BOX(hbox), controlbox, false, false, 0);

	gtk_container_add(GTK_CONTAINER(window), hbox);
	
	gtk_widget_show_all(window);
	
	debug("window created\n");
	return 0;
}


static gboolean gst_monitor_cb(GstBus *bus, GstMessage *message, gpointer user_data)
{
	GstDevice *device;

	switch (GST_MESSAGE_TYPE (message)) {
		case GST_MESSAGE_DEVICE_ADDED:
			gst_message_parse_device_added(message, &device);
			gchar *class = gst_device_get_device_class(device);
			debug("Device added: %p, class: '%s'\n", device, class);

			if (!strcmp(class, "Audio/Sink")) {
				debug("Add audio sink\n");
				struct device_list *entry = calloc(1, sizeof(struct device_list));
				struct device_list **end;
				if (!entry)
					break;

				entry->name = gst_device_get_display_name(device);
				entry->device = device;
				for (end = &devices_audio_sink; *end; end = &(*end)->next);
				*end = entry;
			
				device_update_list();
			}

			g_free(class);
			break;
		case GST_MESSAGE_DEVICE_REMOVED: {
			gst_message_parse_device_removed (message, &device);
			debug("Device removed: %p\n", device);
			
			struct device_list **ep;
			for (ep = &devices_audio_sink; *ep; ep = &(*ep)->next) {
				if ((*ep)->device == device) {
					struct device_list *entry = *ep;
					g_free(entry->name);
					*ep = entry->next;
					free(entry);
					device_update_list();
					break;
				}
			}
			
			break;
		}
		default:
			break;
	}

	return G_SOURCE_CONTINUE;
}

int create_media(int *argc, char ***argv)
{
	gst_init(argc, argv);
	
	GstDeviceMonitor *gst_mon = gst_device_monitor_new();
	
	GstBus *gst_mon_bus = gst_device_monitor_get_bus(gst_mon);

	gst_bus_add_watch(gst_mon_bus, gst_monitor_cb, NULL);
	gst_object_unref(gst_mon_bus);

	if (!gst_device_monitor_start(gst_mon)) {
		debug("Could not start device monitor\n");
	}
	
	return 0;
}

int main (int argc, char **argv)
{
	create_window(&argc, &argv);

	create_media(&argc, &argv);

	struct dml_host *host;

	host = dml_host_create(NULL);
	if (!host) {
		debug("Could not create host\n");
		return -1;
	}

	dml_host_stream_added_cb_set(host, stream_added_cb, NULL);
	dml_host_stream_removed_cb_set(host, stream_removed_cb, NULL);

	debug("Start main loop\n");
	gtk_main();

	debug("Saving config\n");
	dml_config_save(NULL);

	return 0;
}
