ACLOCAL_AMFLAGS=-I m4

CFLAGS+= -Wall -Werror -O3


nobase_include_HEADERS = dml/dml.h dml/dml_client.h dml/dml_connection.h dml/dml_crypto.h dml/dml_host.h dml/dml_id.h dml/dml_packet.h dml/dml_poll.h dml/dml_route.h dml/dml_stream.h dml/dml_server.h


lib_LTLIBRARIES=libdml.la

libdml_la_SOURCES = \
	dml_client.c \
	dml_connection.c \
	dml_crypto.c \
	dml_host.c \
	dml_id.c \
	dml_packet.c \
	dml_poll.c \
	dml_route.c \
	dml_server.c \
	dml_stream.c 

libdml_la_CFLAGS=-fPIC
libdml_la_LDFLAGS= -shared -fPIC -version-info 0:0:0 -lcrypto

bin_PROGRAMS = dmld dml_list dml_reflector dml_streamer dml_stream_client dml_stream_client_codec2 dml_trx dml_httpd dml_fprs_db

DML_SRCS = \
	dml_config.c \
	dml_stream_client_simple.c

ALAW_SRCS = alaw.c

ULAW_SRCS = ulaw.c

TRX_SRCS = \
	trx_dv.c \
	$(ULAW_SRCS) \
	$(ALAW_SRCS)


FPRS_DB_SRCS = \
	fprs_db.c \
	fprs_parse.c \
	fprs_aprsis.c


dmld_SOURCES = $(DML_SRCS) dmld.c
dmld_LDADD = libdml.la


dml_list_SOURCES = $(DML_SRCS) dml_list.c
dml_list_LDADD = libdml.la

dml_reflector_SOURCES = $(DML_SRCS) $(TRX_SRCS) dml_reflector.c soundlib.c
dml_reflector_LDADD = libdml.la
dml_reflector_LDFLAGS = -lcodec2 -leth_ar -lm


dml_trx_SOURCES = $(DML_SRCS) $(TRX_SRCS) $(FPRS_DB_SRCS) dml_trx.c soundlib.c
dml_trx_LDADD = libdml.la
dml_trx_LDFLAGS = -lasound -lcodec2 -leth_ar


dml_streamer_SOURCES = $(DML_SRCS) dml_streamer.c matroska.c ogg.c
dml_streamer_LDADD = libdml.la


dml_stream_client_SOURCES = $(DML_SRCS) dml_stream_client.c
dml_stream_client_LDADD = libdml.la

dml_stream_client_codec2_SOURCES = $(DML_SRCS) $(ULAW_SRCS) $(ALAW_SRCS) dml_stream_client_codec2.c
dml_stream_client_codec2_LDADD = libdml.la


dml_httpd_SOURCES = $(DML_SRCS) dml_httpd.c
dml_httpd_LDADD = libdml.la
dml_httpd_LDFLAGS = -lwebsockets -lmagic

dml_fprs_db_SOURCES = $(DML_SRCS) $(FPRS_DB_SRCS) dml_fprs_db.c
dml_fprs_db_LDADD = libdml.la
dml_fprs_db_LDFLAGS = -leth_ar -lm 
