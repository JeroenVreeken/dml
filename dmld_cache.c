/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2021

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

#include "dmld_cache.h"
#include <dml/dml_id.h>
#include <dml/dml_log.h>

#include <time.h>

struct dmld_cache_entry {
	uint8_t id[DML_ID_SIZE];
	time_t t;
	
	uint8_t header_sig[DML_SIG_SIZE];
	void *header;
	void *description;
	void *certificate;
	size_t header_size;
	size_t description_size;
	size_t certificate_size;
	bool have_header;
	bool have_description;
	bool have_certificate;

	struct dmld_cache_entry *next;
};

static struct dmld_cache_entry *dmld_cache = NULL;
static int dmld_cache_max_size = 128;
static time_t dmld_cache_max_age = 3600;

void dmld_cache_max_size_set(int max)
{
	dmld_cache_max_size = 0;
}

void dmld_cache_max_age_set(time_t age)
{
	dmld_cache_max_age = age;
}

static void dmld_cache_clean(struct dmld_cache_entry *entry)
{
	free(entry->header);
	free(entry->description);
	free(entry->certificate);
	
	entry->header = NULL;
	entry->description = NULL;
	entry->certificate = NULL;
	
	entry->header_size = 0;
	entry->description_size = 0;
	entry->certificate_size = 0;
	
	entry->have_header = false;
	entry->have_description = false;
	entry->have_certificate = false;
	
	entry->t = time(NULL);
}

static struct dmld_cache_entry *dmld_cache_entry_insert(uint8_t id[DML_ID_SIZE])
{
	struct dmld_cache_entry *entry, *oldest = NULL;
	time_t now = time(NULL);
	int entries = 0;

	dml_log(DML_LOG_DEBUG, "dmld_cache_entry_insert(%s)", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
	
	for (entry = dmld_cache; entry; entry = entry->next) {
		entries++;
		if (!memcmp(entry->id, id, DML_ID_SIZE)) {
			// Found it, check age
			if (now - entry->t > dmld_cache_max_age) {
				// to old, clear it first
				dml_log(DML_LOG_DEBUG, "Cached entry is old, clean it");
				dmld_cache_clean(entry);
			}
			return entry;
		}
		if (oldest) {
			if (entry->t < oldest->t)
				oldest = entry;
		} else {
			oldest = entry;
		}
	}
	
	if (entries < dmld_cache_max_size) {
		entry = calloc(1, sizeof(struct dmld_cache_entry));
		
		memcpy(entry->id, id, DML_ID_SIZE);
		entry->t = now;
		entry->next = dmld_cache;
		dmld_cache = entry;
		
		dml_log(DML_LOG_DEBUG, "Created new cache entry");
		return entry;
	}
	
	dml_log(DML_LOG_DEBUG, "Re-use oldest cache entry");
	dmld_cache_clean(oldest);
	return oldest;
}	

int dmld_cache_insert_header(uint8_t id[DML_ID_SIZE], uint8_t sig[DML_SIG_SIZE], void *header, size_t header_size)
{
	struct dmld_cache_entry *entry = dmld_cache_entry_insert(id);
	
	if (!entry)
		return -1;

	if (!entry->have_header) {
		dml_log(DML_LOG_DEBUG, "dmld_cache_insert_header(%s)", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
		memcpy(entry->header_sig, sig, DML_SIG_SIZE);
		if (header_size) {
			entry->header = malloc(header_size);
			if (!entry->header)
				return -2;
			memcpy(entry->header, header, header_size);
			entry->header_size = header_size;
		}
		entry->have_header = true;
	}
	
	return 0;
}

int dmld_cache_insert_description(uint8_t id[DML_ID_SIZE], void *description, size_t description_size)
{
	struct dmld_cache_entry *entry = dmld_cache_entry_insert(id);
	
	if (!entry)
		return -1;

	if (!entry->have_description) {
		entry->description = malloc(description_size);
		if (!entry->description)
			return -2;
		dml_log(DML_LOG_DEBUG, "dmld_cache_insert_description(%s)", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
		memcpy(entry->description, description, description_size);
		entry->description_size = description_size;
		entry->have_description = true;
	}
	
	return 0;
}

int dmld_cache_insert_certificate(uint8_t id[DML_ID_SIZE], void *certificate, size_t certificate_size)
{
	struct dmld_cache_entry *entry = dmld_cache_entry_insert(id);
	
	if (!entry)
		return -1;

	if (!entry->have_certificate) {
		if (certificate_size) {
			entry->certificate = malloc(certificate_size);
			if (!entry->certificate)
				return -2;
			memcpy(entry->certificate, certificate, certificate_size);
			entry->certificate_size = certificate_size;
		}
		entry->have_certificate = true;
	}
	
	return 0;
}

bool dmld_cache_search_header(uint8_t id[DML_ID_SIZE], uint8_t sig[DML_SIG_SIZE], void **header, size_t *header_size)
{
	struct dmld_cache_entry *entry;
	
	dml_log(DML_LOG_DEBUG, "dmld_cache_sarch_hader(%s)", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
	for (entry = dmld_cache; entry; entry = entry->next) {
		if (!memcmp(entry->id, id, DML_ID_SIZE)) {
			if (time(NULL) - entry->t > dmld_cache_max_age) {
				// to old, clear it first
				dml_log(DML_LOG_DEBUG, "Cached entry %s old, clean it", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
				dmld_cache_clean(entry);
				return false;
			}
			if (entry->have_header) {
				*header = entry->header;
				*header_size = entry->header_size;
				memcpy(sig, entry->header_sig, DML_SIG_SIZE);
				return true;
			}
			return false;
		}
	}
	return false;
}

bool dmld_cache_search_description(uint8_t id[DML_ID_SIZE], void **description, size_t *description_size)
{
	struct dmld_cache_entry *entry;
	
	dml_log(DML_LOG_DEBUG, "dmld_cache_sarch_description(%s)", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
	for (entry = dmld_cache; entry; entry = entry->next) {
		if (!memcmp(entry->id, id, DML_ID_SIZE)) {
			if (time(NULL) - entry->t > dmld_cache_max_age) {
				// to old, clear it first
				dml_log(DML_LOG_DEBUG, "Cached entry %s old, clean it", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
				dmld_cache_clean(entry);
				return false;
			}
			if (entry->have_description) {
				*description = entry->description;
				*description_size = entry->description_size;
				return true;
			}
			return false;
		}
	}
	return false;
}

bool dmld_cache_search_certificate(uint8_t id[DML_ID_SIZE], void **certificate, size_t *certificate_size)
{
	struct dmld_cache_entry *entry;
	
	dml_log(DML_LOG_DEBUG, "dmld_cache_sarch_certificate(%s)", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
	for (entry = dmld_cache; entry; entry = entry->next) {
		if (!memcmp(entry->id, id, DML_ID_SIZE)) {
			if (time(NULL) - entry->t > dmld_cache_max_age) {
				// to old, clear it first
				dml_log(DML_LOG_DEBUG, "Cached entry %s old, clean it", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
				dmld_cache_clean(entry);
				return false;
			}
			if (entry->have_certificate) {
				*certificate = entry->certificate;
				*certificate_size = entry->certificate_size;
				return true;
			}
			return false;
		}
	}
	return false;
}

int dmld_cache_delete(uint8_t id[DML_ID_SIZE])
{
	struct dmld_cache_entry **entry;
	
	for (entry = &dmld_cache; *entry; entry = &(*entry)->next) {
		if (!memcmp((*entry)->id, id, DML_ID_SIZE)) {
			struct dmld_cache_entry *old = *entry;
			
			*entry = old->next;
			
			dml_log(DML_LOG_DEBUG, "dmld_cache_delete(%s)", dml_id_str_na((char[DML_ID_STR_SIZE]){}, id));
			dmld_cache_clean(old);
			free(old);
			
			return 0;
		}
	}
	
	return -1;
}
