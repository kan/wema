use inc::Module::Install;

name 'Wema';
version '3.0';

requires 'Plack';
requires 'Plack::Request';
requires 'Twiggy';
requires 'Protocol::WebSocket';
requires 'JSON';
requires 'Data::UUID::Base64URLSafe';

WriteAll;
