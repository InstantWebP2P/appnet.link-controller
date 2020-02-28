#!/bin/bash

# Generate&Store Certs in memory instead of disk
# TBD...

rm -rf ../certs-tmp/*
umount absolute dir/certs-tmp
mount tmpfs absolute dir/certs-tmp -t tmpfs -o size=16m
echo "mount certs-tmp done"
