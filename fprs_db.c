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

#include <fprs_db.h>

#include <string.h>
#include <stdlib.h>
#include <stdio.h>

struct fprs_db_data {
	enum fprs_type type;
	uint8_t *data;
	size_t datasize;
	
	unsigned int link;
	
	time_t t;
	time_t t_valid;
	
	struct fprs_db_data *next;
};

struct fprs_db_entry {
	struct fprs_db_entry *next;

	struct fprs_db_id id;
	struct fprs_db_data *elements;
};

static struct fprs_db_entry *db;

static struct fprs_db_entry *fprs_db_find(struct fprs_db_id *id)
{
	struct fprs_db_entry *entry;

	for (entry = db; entry; entry = entry->next) {
		if (id->type != entry->id.type)
			continue;
		if (id->type == FPRS_CALLSIGN) {
			if (!memcmp(entry->id.id.callsign, id->id.callsign, 6))
				return entry;
		} else if (id->type == FPRS_OBJECTNAME) {
			if (!strcmp(entry->id.id.name, id->id.name))
				return entry;
		}
	}
	
	return NULL;
}

static struct fprs_db_entry *fprs_db_add(struct fprs_db_id *id)
{
	struct fprs_db_entry *entry;
	
	entry = calloc(sizeof(struct fprs_db_entry), 1);
	if (!entry)
		return NULL;

	memcpy(&entry->id, id, sizeof(struct fprs_db_id));
	entry->next = db;
	db = entry;
	
	return entry;
}

static int fprs_db_check(struct fprs_db_entry *check)
{
	if (!check->elements) {
		struct fprs_db_entry **entry, **next;
		
		for (entry = &db; *entry; entry = next) {
			if (*entry == check) {
				*entry = check->next;
				next = entry;
			} else {
				next = &(*entry)->next;
			}
		}
		
		free(check);
	}
	
	return 0;
}


int fprs_db_flush(time_t t)
{
	struct fprs_db_entry *entry, *next_entry;;
	
	for (entry = db; entry; entry = next_entry) {
		next_entry = entry->next;
		
		struct fprs_db_data **dentry, **next_dentry;
		for (dentry = &entry->elements; *dentry; dentry = next_dentry) {
			next_dentry = &(*dentry)->next;
			
			if ((*dentry)->t_valid < t) {
				struct fprs_db_data *old = *dentry;
				printf("Removing element\n");
				
				*dentry = old->next;
				next_dentry = dentry;
				free(old->data);
				free(old);
			}
		}
		
		fprs_db_check(entry);
	}
	
	return 0;
}


int fprs_db_element_set(struct fprs_db_id *id, 
    enum fprs_type type, 
    time_t t, time_t t_valid, 
    unsigned int link, 
    uint8_t *data, size_t datasize)
{
	struct fprs_db_entry *entry;
	
	entry = fprs_db_find(id);

	if (!entry) {
		entry = fprs_db_add(id);
		if (!entry)
			return -1;
	}

	struct fprs_db_data **dentry;

	bool unique = fprs_type_is_unique(type);
	
	/* Does it exist already? */
	for (dentry = &entry->elements; *dentry; dentry = &(*dentry)->next) {
		if ((*dentry)->type == type) {
			/* If it is a unique element just the existance is enough */
			if (unique)
				break;
			/* non-unuque types must match exact */
			if ((*dentry)->datasize == datasize && !memcmp((*dentry)->data, data, datasize))
				break;
		}
	}
	if (!*dentry) {
		*dentry = calloc(1, sizeof(struct fprs_db_data));
		if (!*dentry)
			return -1;
	}
	free((*dentry)->data);
	(*dentry)->datasize = 0;
	(*dentry)->data = malloc(datasize);
	if ((*dentry)->data) {
		memcpy((*dentry)->data, data, datasize);
		(*dentry)->datasize = datasize;
		(*dentry)->t = t;
		(*dentry)->t_valid = t + t_valid;
		(*dentry)->type = type;
		(*dentry)->link = link;
	}
	
	return 0;
}

int fprs_db_element_get(struct fprs_db_id *id, enum fprs_type type, time_t *t, uint8_t **data, size_t *datasize)
{
	struct fprs_db_entry *entry = NULL;
	struct fprs_db_data *dentry;
	
	if (id->type == FPRS_CALLSIGN ||
	    id->type == FPRS_OBJECTNAME) {
		entry = fprs_db_find(id);
	} else {
		/* Search all data entries for the right type and content */
		struct fprs_db_entry *entry;

		for (entry = db; entry; entry = entry->next) {
			bool found_id = false;
			
			for (dentry = entry->elements; dentry; dentry = dentry->next) {
				if (dentry->type != id->type)
					continue;
				if (dentry->datasize != id->id_size)
					continue;
				if (memcmp(dentry->data, &id->id, id->id_size))
					continue;
				
				found_id = true;
				break;
			}
			if (found_id) {
				break;
			}
		}
	}

	if (!entry || !entry->elements) {
		return -1;
	}
	
	for (dentry = entry->elements; dentry; dentry = dentry->next) {
		if (dentry->type != type)
			continue;
		*data = malloc(dentry->datasize);
		if (!*data)
			return -1;
		memcpy(*data, dentry->data, dentry->datasize);
		*datasize = dentry->datasize;
		*t = dentry->t;
	
		return 0;
	}

	return -1;
}



int fprs_db_element_del(struct fprs_db_id *id, enum fprs_type type)
{
	struct fprs_db_entry *entry;
	
	entry = fprs_db_find(id);
	if (!entry || !entry->elements) {
		return -1;
	}

	struct fprs_db_data **dentry;
	
	for (dentry = &entry->elements; *dentry; dentry = &(*dentry)->next) {
		if ((*dentry)->type == type) {
			struct fprs_db_data *old = *dentry;
			
			*dentry = old->next;
			free(old->data);
			free(old);
			break;
		}
	}

	fprs_db_check(entry);
	
	return 0;
}

unsigned int fprs_db_link_get(struct fprs_db_id *id)
{
	struct fprs_db_entry *entry;
	
	entry = fprs_db_find(id);
	if (!entry || !entry->elements) {
		return 0;
	}

	unsigned int link = 0;
	struct fprs_db_data *dentry;
	
	for (dentry = entry->elements; dentry; dentry = dentry->next)
		link |= dentry->link;

	return link;
}
