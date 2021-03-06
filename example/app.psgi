#!/usr/bin/env perl

use strict;
use warnings;

use AnyEvent::Handle;
use Protocol::WebSocket::Handshake::Server;
use Protocol::WebSocket::Frame;
use Plack::Builder;
use Plack::Request;
use JSON qw();
use Data::UUID::Base64URLSafe;

my %db;
my %member;
my $DATA = do { local $/; <DATA> };

my $psgi_app = sub {
    my $env = shift;
    my $req = Plack::Request->new($env);
    my $res = $req->new_response(200);

    if ($req->path eq '/') {
        $res->content_type('text/html; charset=utf8');
        $res->content($DATA);
        return $res->finalize;
    }
    elsif ($req->path eq '/list') {
        $res->content_type('application/json; charset=utf8');
        $res->content(JSON::encode_json([values %db]));
        return $res->finalize;
    }
    elsif ($req->path eq '/clear_all_tags' && $req->method eq 'POST') {
        undef %db;
        $res->content_type('application/json; charset=utf8');
        my $msg = Protocol::WebSocket::Frame->new(JSON::encode_json({ action => 'clear_all_tags' }))->to_bytes;
        $_->push_write($msg) for values %member;
        return $res->finalize;
    }
    elsif ($req->path eq '/handle') {
        my $fh = $env->{'psgix.io'} or return [500, [], []];

        my $hs = Protocol::WebSocket::Handshake::Server->new_from_psgi($env);
        $hs->parse($fh) or return [400, [], [$hs->error]];

        return sub {
            my $respond = shift;

            my $h = AnyEvent::Handle->new(fh => $fh);
            my $cv = AnyEvent::condvar;
            my $frame = Protocol::WebSocket::Frame->new;

            $member{fileno($fh)} = $h;

            $h->push_write($hs->to_string);

            $h->on_read(
                sub {
                    $frame->append($_[0]->rbuf);

                    while (my $message = $frame->next) {
                        warn $message;
                        my $json = JSON::decode_json($message);
                        unless ($json->{tagId}) {
                            $json->{tagId} = Data::UUID::Base64URLSafe->new->create_b64_urlsafe;
                        }

                        $db{$json->{tagId}} = $json;
                        my $msg = Protocol::WebSocket::Frame->new(JSON::encode_json($json))->to_bytes;
                        $_->push_write($msg) for values %member;
                    }
                }
            );

            $h->on_error(
                sub {
                    my ($hdl, $fatal, $msg) = @_;
                    delete $member{fileno($fh)};
                    $hdl->destroy;
                    $cv->send;
                    undef $h;
                }
            );

            $h->on_eof(
                sub {
                    my ($hdl) = @_;
                    delete $member{fileno($fh)};
                    $hdl->destroy;
                    $cv->send;
                    undef $h;
                }
            );
        };
    }
};


builder {
    enable 'Static', path => qr{^/js/}, root => '.';
    $psgi_app;
};

__DATA__
<html>
<head>
  <title>wema sample</title>
  <script src="../js/zepto.js"></script>
</head>
<body>
  <script src="../js/wema-storage-remote.js"></script>
  <script src="../js/wema.js"></script>
</body>
</html>
