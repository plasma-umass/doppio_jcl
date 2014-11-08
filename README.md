Doppio: Java Home
=================
This repository automates the process of downloading, extracting, and massaging the
OpenJDK Java Class Library and Java Home files into a structure that makes sense for
Doppio.

Setting Up
----------
Grab all of the needed Node and Bower dependencies:

```
npm install
bower install
```

Then, run `grunt` to generate `java_home.tar.gz`, which can be extracted to
`vendor/java_home` in a doppio folder.
