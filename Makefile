include build.mk

CFLAGS += -g -Wall -Werror
LDFLAGS += -lcrypto

DML_SRCS = \
	dml_client.c \
	dml_config.c \
	dml_connection.c \
	dml_crypto.c \
	dml_id.c \
	dml_packet.c \
	dml_poll.c \
	dml_route.c \
	dml_server.c \
	dml_stream.c

DML_OBJS = $(DML_SRCS:.c=.o)

all: dmld dml_list dml_reflector dml_streamer_ogg dml_stream_client

SRCS += $(DML_SRCS)

SRCS += dmld.c
dmld: $(DML_OBJS) dmld.o

SRCS += dml_list.c
dml_list: $(DML_OBJS) dml_list.o

SRCS += dml_reflector.c
dml_reflector: $(DML_OBJS) dml_reflector.o

SRCS += dml_streamer_ogg.c
dml_streamer_ogg: $(DML_OBJS) dml_streamer_ogg.o

SRCS += dml_stream_client.c
dml_stream_client: $(DML_OBJS) dml_stream_client.o

DEPS:=$(SRCS:.c=.d)
-include $(DEPS)

OBJS+=$(SRCS:.c=.o)

clean:
	rm -rf $(OBJS) \
		dml_list \
		dml_reflector \
		dml_streamer_ogg \
		dml_stream_client

