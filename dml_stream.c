/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015, 2016

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
#include "dml_stream.h"
#include "dml_packet.h"
#include "dml_id.h"

#include <string.h>

struct dml_stream {
	struct dml_stream *next;
	
	uint8_t id[DML_ID_SIZE];

	uint8_t version;
	uint32_t bps;
	char *mime;
	char *name;
	char *alias;
	char *description;
	
	struct dml_crypto_key *crypto;
	
	uint16_t data_id;
	uint64_t timestamp;
	
	struct dml_stream_priv *priv;
};

static struct dml_stream *streams = NULL;

struct dml_stream *dml_stream_iterate(struct dml_stream *prev)
{
	if (!prev)
		return streams;
	
	struct dml_stream *entry;
	
	for (entry = streams; entry; entry = entry->next) {
		if (entry == prev)
			return entry->next;
	}
	return NULL;
}

struct dml_stream *dml_stream_by_id(uint8_t id[DML_ID_SIZE])
{
	struct dml_stream *stream;
	
	for (stream = streams; stream; stream = stream->next)
		if (!memcmp(stream->id, id, DML_ID_SIZE))
			break;
	return stream;
}

struct dml_stream *dml_stream_by_id_alloc(uint8_t id[DML_ID_SIZE])
{
	struct dml_stream *stream = dml_stream_by_id(id);
	
	if (!stream) {
		stream = calloc(1, sizeof(struct dml_stream));
		if (stream) {
			stream->next = streams;
			streams = stream;
			memcpy(stream->id, id, DML_ID_SIZE);
			dml_stream_name_set(stream, "");
		}
	}
		
	return stream;
}

struct dml_stream *dml_stream_by_data_id(uint16_t data_id)
{
	struct dml_stream *stream;
	
	for (stream = streams; stream; stream = stream->next)
		if (stream->data_id == data_id)
			break;

	return stream;
}

struct dml_stream *dml_stream_by_alias(char *alias)
{
	struct dml_stream *stream;
	
	for (stream = streams; stream; stream = stream->next) {
		if (!stream->alias)
			continue;
		if (!strcmp(stream->alias, alias))
			break;
	}
	
	return stream;
}

void dml_stream_remove(struct dml_stream *ds)
{
	struct dml_stream **entry;
	
	for (entry = &streams; *entry; entry = &(*entry)->next) {
		if (ds != *entry)
			continue;
		*entry = ds->next;
		
		free(ds->name);
		free(ds->alias);
		free(ds->description);
		free(ds->mime);
		
		dml_crypto_key_free(ds->crypto);
		
		free(ds);
		return;
	}
}

struct dml_stream *dml_stream_update_description(uint8_t *data, uint16_t len)
{
	uint8_t id[DML_ID_SIZE];
	uint8_t v_id[DML_ID_SIZE];
	uint8_t version;
	uint32_t bps;
	char *mime;
	char *name;
	char *alias;
	char *description;

	struct dml_stream *stream;
		
	if (dml_packet_parse_description(data, len, id, &version, &bps, 
	    &mime, &name, &alias, &description))
		goto err_parse;

	if (dml_id_gen(v_id, version, bps, mime, name, alias, description))
		goto err_id;
	
	if (memcmp(id, v_id, DML_ID_SIZE))
		goto err_id_cmp;

	stream = dml_stream_by_id_alloc(id);
	if (!stream)
		goto err_stream;

	free(stream->name);
	free(stream->alias);
	free(stream->description);
	free(stream->mime);
	stream->name = name;
	stream->alias = alias;
	stream->description = description;
	stream->mime = mime;

	return stream;

err_stream:
err_id_cmp:
err_id:
	free(description);
	free(alias);
	free(name);
	free(mime);
err_parse:
	return NULL;
}

uint8_t *dml_stream_id_get(struct dml_stream *ds)
{
	return ds->id;
}

char *dml_stream_name_get(struct dml_stream *stream)
{
	return stream->name;
}

int dml_stream_name_set(struct dml_stream *stream, char *name)
{
	char *aname = strdup(name);
	if (!aname)
		return -1;
	free(stream->name);
	stream->name = aname;

	return 0;
}

char *dml_stream_alias_get(struct dml_stream *stream)
{
	return stream->alias;
}

int dml_stream_alias_set(struct dml_stream *stream, char *alias)
{
	char *aalias = strdup(alias);
	if (!aalias)
		return -1;
	free(stream->alias);
	stream->alias = aalias;

	return 0;
}

char *dml_stream_mime_get(struct dml_stream *stream)
{
	return stream->mime;
}

int dml_stream_mime_set(struct dml_stream *stream, char *mime)
{
	char *amime = strdup(mime);
	if (!amime)
		return -1;
	free(stream->mime);
	stream->mime = amime;

	return 0;
}

char *dml_stream_description_get(struct dml_stream *stream)
{
	return stream->description;
}

int dml_stream_description_set(struct dml_stream *stream, char *description)
{
	char *adescription = strdup(description);
	if (!adescription)
		return -1;
	free(stream->description);
	stream->description = adescription;

	return 0;
}

struct dml_crypto_key *dml_stream_crypto_get(struct dml_stream *stream)
{
	return stream->crypto;
}

int dml_stream_crypto_set(struct dml_stream *stream, struct dml_crypto_key *crypto)
{
	stream->crypto = crypto;
	return 0;
}

uint32_t dml_stream_bps_get(struct dml_stream *ds)
{
	return ds->bps;
}

int dml_stream_bps_set(struct dml_stream *ds, uint32_t bps)
{
	ds->bps = bps;
	return 0;
}

uint16_t dml_stream_data_id_get(struct dml_stream *ds)
{
	return ds->data_id;
}

int dml_stream_data_id_set(struct dml_stream *ds, uint16_t data_id)
{
	ds->data_id = data_id;
	return 0;
}

uint64_t dml_stream_timestamp_get(struct dml_stream *ds)
{
	return ds->timestamp;
}

int dml_stream_timestamp_set(struct dml_stream *ds, uint64_t timestamp)
{
	ds->timestamp = timestamp;
	return 0;
}

struct dml_stream_priv *dml_stream_priv_get(struct dml_stream *ds)
{
	return ds->priv;
}

int dml_stream_priv_set(struct dml_stream *ds, struct dml_stream_priv *priv)
{
	ds->priv = priv;
	return 0;
}
